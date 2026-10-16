import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {z} from "zod";
import {repository,type Repository} from "../db/repository";
import {AppError,notFound} from "../errors";
import {getEnv} from "../env";
import {getPlan} from "../billing/plans";
import {debit,refund} from "../billing/ledger";
import {validateInput} from "../catalog/server";
import type {ValidatedInput} from "../catalog/types";
import {HiggsfieldClient,HiggsfieldError} from "../higgsfield/client";
import type {ProviderResult,ProviderOutput} from "../higgsfield/types";
import {buildWebhookUrl} from "../higgsfield/webhook";
import {retainOutputs,createDemoOutput,getProviderMediaUrl} from "../storage";
import type {Generation,Media,Output} from "../types";
export const inputSchema=z.object({
 modelId:z.string().min(1).max(200),prompt:z.string().max(30000).default(""),
 settings:z.record(z.string(),z.union([z.string().max(30000),z.number().finite(),z.boolean()])).default({}),
 media:z.array(z.object({id:z.string().min(1).max(200),role:z.enum(["start","end","reference","video","audio","source"])}).strict()).max(50).default([]),
 projectId:z.string().max(200).optional(),presetId:z.string().max(200).optional(),
 demoOutcome:z.enum(["completed","failed","nsfw"]).optional(),maxCredits:z.number().int().positive().max(1000000).optional()
}).strict();
export const createSchema=inputSchema.extend({idempotencyKey:z.uuid()});
export type GenerationInput=z.infer<typeof inputSchema>;
export const activeStatuses=["pending_submit","queued","in_progress"] as const;
const terminal=new Set(["completed","failed","nsfw","canceled"]);
function canonical(value:unknown):string{
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+canonical(v)).join(",")+"}";
 return JSON.stringify(value);
}
function hash(value:unknown){return createHash("sha256").update(canonical(value)).digest("hex");}
type Provider=Pick<HiggsfieldClient,"submit"|"status"|"cancel"|"estimate">;
interface Options{
 repo:Repository;mode:"demo"|"live";provider?:Provider;
 retain:(generation:Generation,outputs:ProviderOutput[])=>Promise<Output[]>;
 demoRetain:(generation:Generation)=>Promise<Output[]>;
 mediaUrl:typeof getProviderMediaUrl;
 markup:number;creditUsd:number;maxUsd:number;webhookBase?:string;webhookSecret?:string;
}
export class GenerationService{
 constructor(private options:Options){}
 private get repo(){return this.options.repo;}
 async owned(userId:string,id:string,allowDeleted=false){const g=await this.repo.read(tx=>tx.get("generations",id));if(!g||g.userId!==userId||(!allowDeleted&&g.deletedAt))notFound();return g;}
 private async prepare(userId:string,input:GenerationInput){
  const media:Media[]=[],providerMedia:Media[]=[];
  await this.repo.read(async tx=>{
   if(input.projectId){const p=await tx.get("projects",input.projectId);if(!p||p.userId!==userId)notFound();}
   const override=await tx.get("model_pricing",input.modelId);
   if(override?.enabled===false)throw new AppError("MODEL_DISABLED","This model is disabled by the studio operator.",503);
   for(const item of input.media){
    const upload=await tx.get("uploads",item.id);
    if(upload&&upload.userId===userId&&upload.status!=="pending"){
     if(!upload.r2Key)throw new AppError("MEDIA_UNAVAILABLE","This attachment needs to be uploaded again.");
     const url=this.options.mode==="demo"?"https://preview.invalid/"+encodeURIComponent(item.id):await this.options.mediaUrl({r2Key:upload.r2Key,contentType:upload.contentType,providerUrl:upload.providerUrl});
     media.push({id:upload.id,url:upload.url,kind:upload.kind,role:item.role,contentType:upload.contentType,bytes:upload.bytes});
     providerMedia.push({...media.at(-1)!,url});continue;
    }
    const g=await tx.get("generations",item.id);
    if(!g||g.deletedAt||g.userId!==userId||g.status!=="completed"||!g.outputs.length)notFound();
    const output=g.outputs[0];
    const url=this.options.mode==="demo"?"https://preview.invalid/"+encodeURIComponent(item.id):await this.options.mediaUrl({r2Key:output.r2Key,contentType:output.contentType});
    media.push({id:g.id,url:output.url,kind:output.kind,role:item.role,contentType:output.contentType});
    providerMedia.push({...media.at(-1)!,url});
   }
  });
  if(input.settings.file_url||input.settings.link_url)throw new AppError("OWNED_MEDIA_REQUIRED","Use a studio upload for media references. External document and web references are not enabled.");
  const validated=validateInput(input.modelId,input.prompt,input.settings,providerMedia);
  return {validated,media,providerMedia};
 }
 private async price(input:ValidatedInput){
  if(this.options.mode==="demo")return {credits:input.model.surface==="video"?60:4,usd:0,mode:"demo" as const,verified:false};
  if(!this.options.provider)throw new AppError("PROVIDER_NOT_CONFIGURED","Connect the server media provider first.",503);
  const estimate=await this.options.provider.estimate(input);
  if(estimate.usd>this.options.maxUsd)throw new AppError("SPEND_LIMIT","This request exceeds the operator's per-generation spend limit.",402);
  const override=await this.repo.read(tx=>tx.get("model_pricing",input.modelId));
  const retail=Math.max(estimate.usd*this.options.markup,override?.usd??0);
  return {credits:Math.max(1,Math.ceil(retail/this.options.creditUsd)),usd:estimate.usd,mode:"live" as const,verified:true};
 }
 async quote(userId:string,input:GenerationInput){return this.price((await this.prepare(userId,input)).validated);}
 async create(userId:string,input:GenerationInput,key:string){
  const id=hash(userId+":"+key).slice(0,40),inputHash=hash(input);
  const existing=await this.repo.read(tx=>tx.get("generations",id));
  if(existing){if(existing.userId!==userId)notFound();if(existing.deletedAt)throw new AppError("GENERATION_DELETED","This request was deleted. Start a new generation with a new request key.",410);if(existing.inputHash!==inputHash)throw new AppError("IDEMPOTENCY_CONFLICT","This request key was already used for different input.",409);return existing;}
  const prepared=await this.prepare(userId,input),quote=await this.price(prepared.validated);
  if(this.options.mode==="live"&&!input.maxCredits)throw new AppError("QUOTE_REQUIRED","Review a current price quote before generating.",409);
  if(input.maxCredits&&quote.credits>input.maxCredits)throw new AppError("PRICE_CHANGED","The generation price changed. Review the updated quote before continuing.",409);
  const now=new Date().toISOString();
  const webhookUrl=this.options.mode==="live"?buildWebhookUrl(this.options.webhookBase,id,this.options.webhookSecret??""):undefined;
  const created=await this.repo.transaction(async tx=>{
   const prior=await tx.get("generations",id);
   if(prior){if(prior.deletedAt)throw new AppError("GENERATION_DELETED","This request was deleted. Start a new generation with a new request key.",410);if(prior.inputHash!==inputHash)throw new AppError("IDEMPOTENCY_CONFLICT","This request key was already used for different input.",409);return {generation:prior,created:false};}
   const user=await tx.get("profiles",userId);if(!user)throw new AppError("UNAUTHENTICATED","Sign in to create media.",401);
   const pending=await tx.find("generations",{userId,status:{$in:activeStatuses}},20);
   if(pending.length>=getPlan(user.plan).concurrent)throw new AppError("CONCURRENCY_LIMIT","Your current generations must finish before another starts.",429);
   if(input.projectId){const p=await tx.get("projects",input.projectId);if(!p||p.userId!==userId)notFound();}
   const charge=await debit(tx,user,quote.credits,id);
   const generation:Generation={id,userId,surface:prepared.validated.model.surface,modelId:prepared.validated.modelId,prompt:prepared.validated.prompt,settings:prepared.validated.settings,media:prepared.media,providerMedia:prepared.providerMedia,projectId:input.projectId,presetId:input.presetId,status:"pending_submit",cost:quote.credits,quoteUsd:quote.usd,debit:charge.allocation,outputs:[],isPublic:false,createdAt:now,updatedAt:now,inputHash,...(webhookUrl?{webhookUrl}:{}),...(this.options.mode==="demo"?{demoOutcome:input.demoOutcome??"completed"}:{})};
   await tx.insert("generations",generation);return {generation,created:true};
  });
  if(!created.created)return created.generation;
  return this.submit(created.generation);
 }
 private input(g:Generation){return validateInput(g.modelId,g.prompt,g.settings,g.providerMedia??[]);}
 private async update(id:string,run:(g:Generation)=>Generation){
  return this.repo.transaction(async tx=>{const g=await tx.get("generations",id);if(!g)notFound();const next=run(g);await tx.put("generations",next);return next;});
 }
 private async submit(g:Generation):Promise<Generation>{
  if(this.options.mode==="demo")return this.update(g.id,current=>terminal.has(current.status)?current:{...current,status:"queued",requestId:"preview-"+g.id,updatedAt:new Date().toISOString()});
  try{
   const result=await this.options.provider!.submit(this.input(g),{idempotencyKey:g.id,webhookUrl:g.webhookUrl});
   const saved=await this.update(g.id,current=>terminal.has(current.status)?current:{...current,requestId:result.requestId,providerStatusUrl:result.statusUrl,providerCancelUrl:result.cancelUrl,status:result.status==="completed"?"in_progress":result.status==="failed"||result.status==="nsfw"||result.status==="canceled"?"queued":result.status,error:undefined,updatedAt:new Date().toISOString()});
   return this.apply(saved,result);
  }catch(error){
   if(!(error instanceof HiggsfieldError)||error.ambiguous)return this.update(g.id,current=>({...current,error:"The provider has not confirmed submission. The studio will reconcile the same request without a second charge.",updatedAt:new Date().toISOString()}));
   return this.fail(g.id,"failed",error instanceof HiggsfieldError?error.message:"Submission could not be completed.");
  }
 }
 private async fail(id:string,status:"failed"|"nsfw"|"canceled",message?:string){
  return this.repo.transaction(async tx=>{
   const g=await tx.get("generations",id);if(!g)notFound();if(terminal.has(g.status))return g;
   await refund(tx,g);const now=new Date().toISOString();
   const next:Generation={...g,status,error:message,updatedAt:now,finishedAt:now,finalizingUntil:undefined,finalizingToken:undefined};
   await tx.put("generations",next);return next;
  });
 }
 async apply(g:Generation,result:ProviderResult){
  if(g.requestId&&g.requestId!==result.requestId)throw new AppError("REQUEST_MISMATCH","The provider response does not match this generation.",502);
  if(terminal.has(g.status))return g;
  if(result.status==="failed"||result.status==="nsfw"||result.status==="canceled")return this.fail(g.id,result.status,result.error);
  if(result.status!=="completed")return this.update(g.id,current=>terminal.has(current.status)?current:{...current,status:result.status,updatedAt:new Date().toISOString()});
  const leased=await this.repo.transaction(async tx=>{
   const current=await tx.get("generations",g.id);if(!current)notFound();
   if(terminal.has(current.status)||(current.finalizingUntil&&Date.parse(current.finalizingUntil)>Date.now()))return null;
   const next={...current,finalizingUntil:new Date(Date.now()+300000).toISOString(),finalizingToken:randomUUID()};await tx.put("generations",next);return next;
  });
  if(!leased)return (await this.repo.read(tx=>tx.get("generations",g.id)))!;
  try{
   const outputs=this.options.mode==="demo"?await this.options.demoRetain(leased):await this.options.retain(leased,result.outputs);
   if(!outputs.length)throw new Error("No usable media outputs");
   return this.update(g.id,current=>terminal.has(current.status)||current.finalizingToken!==leased.finalizingToken?current:{...current,status:"completed",outputs,finishedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),finalizingUntil:undefined,finalizingToken:undefined,retentionError:undefined,error:undefined});
  }catch{
   return this.update(g.id,current=>terminal.has(current.status)||current.finalizingToken!==leased.finalizingToken?current:({...current,status:"in_progress",retentionError:"The provider finished, but durable media storage needs a retry. Your output is not marked complete yet.",updatedAt:new Date().toISOString(),finalizingUntil:undefined,finalizingToken:undefined}));
  }
 }
 async refresh(userId:string,id:string){
  let g=await this.owned(userId,id);if(terminal.has(g.status))return g;
  if(g.status==="pending_submit")g=await this.submit(g);
  if(terminal.has(g.status))return g;
  if(this.options.mode==="demo"){
   if(Date.now()-Date.parse(g.createdAt)<1500)return this.update(g.id,current=>terminal.has(current.status)?current:({...current,status:"in_progress",updatedAt:new Date().toISOString()}));
   return this.apply(g,{requestId:g.requestId!,status:g.demoOutcome??"completed",outputs:[],error:g.demoOutcome==="failed"?"Local preview failure simulation. Credits were refunded.":g.demoOutcome==="nsfw"?"Local preview content-filter simulation. Credits were refunded.":undefined});
  }
  if(!g.requestId)return g;
  return this.apply(g,await this.options.provider!.status(g.requestId,g.providerStatusUrl));
 }
 async cancel(userId:string,id:string){
  let g=await this.owned(userId,id);if(terminal.has(g.status))return g;
  if(this.options.mode==="demo")return this.fail(g.id,"canceled","Canceled in the local preview. Credits were refunded.");
  if(g.status==="pending_submit")g=await this.submit(g);
  if(terminal.has(g.status))return g;
  if(!g.requestId)throw new AppError("SUBMISSION_UNCONFIRMED","Submission is still being reconciled. Retry cancellation shortly.",409);
  const result=await this.options.provider!.cancel(g.requestId,g.providerCancelUrl);
  return this.apply(g,result);
 }
}
export function generationService(){
 const env=getEnv();if(env.APP_MODE==="showcase")throw new AppError("SHOWCASE_READ_ONLY","Hosted preview generation is not enabled.",503);return new GenerationService({repo:repository(),mode:env.APP_MODE,
  provider:env.APP_MODE==="live"?new HiggsfieldClient({credentials:process.env.HF_CREDENTIALS!,baseUrl:env.HF_API_BASE_URL}):undefined,
  retain:retainOutputs,demoRetain:createDemoOutput,mediaUrl:getProviderMediaUrl,
  markup:env.CREDIT_MARKUP,creditUsd:env.CREDIT_USD_VALUE,maxUsd:env.MAX_GENERATION_USD,
  webhookBase:env.HF_WEBHOOK_BASE_URL||undefined,webhookSecret:process.env.HF_WEBHOOK_SECRET
 });
}
export async function reconcile(limit=8){
 const pending=await repository().read(tx=>tx.find("generations",{status:{$in:activeStatuses}},limit,{updatedAt:1,id:1}));
 const results=await Promise.allSettled(pending.map(async g=>{try{return await generationService().refresh(g.userId,g.id);}finally{await repository().transaction(async tx=>{const current=await tx.get("generations",g.id);if(current&&!terminal.has(current.status))await tx.put("generations",{...current,updatedAt:new Date().toISOString()});});}}));
 return {checked:pending.length,settled:results.filter(r=>r.status==="fulfilled").length,errors:results.filter(r=>r.status==="rejected").length};
}
