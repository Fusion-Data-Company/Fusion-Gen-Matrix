import {randomUUID} from "node:crypto";
import {z} from "zod";
import {api,body} from "@/lib/http";
import {requireAdmin} from "@/lib/auth/server";
import {assertSameOrigin,rateLimit} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {changeCredits} from "@/lib/billing/ledger";
import {publicGeneration} from "@/lib/serialize";
import {getModel} from "@/lib/catalog";
import {AppError,notFound} from "@/lib/errors";
const settings=z.record(z.string(),z.union([z.string().max(30000),z.number().finite(),z.boolean()]));
const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("adjust-credits"),userId:z.string().max(200),delta:z.number().int().min(-100000).max(100000),bucket:z.enum(["subscription","topup"]).default("topup"),note:z.string().trim().min(5).max(500)}).strict(),
 z.object({action:z.literal("toggle-model"),modelId:z.string().max(200),enabled:z.boolean()}).strict(),
 z.object({action:z.literal("set-price"),modelId:z.string().max(200),usd:z.number().positive().max(100).nullable(),note:z.string().max(500).default("")}).strict(),
 z.object({action:z.literal("save-preset"),preset:z.object({id:z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),slug:z.string().regex(/^[a-z0-9-]+$/).max(80),title:z.string().min(1).max(80),description:z.string().max(300),surface:z.enum(["image","video","audio"]),modelId:z.string().max(200),promptTemplate:z.string().min(1).max(10000),settings,category:z.string().max(80),coverUrl:z.string().regex(/^\/art\/[a-z0-9-]+\.svg$/),active:z.boolean()}).strict()}).strict(),
 z.object({action:z.literal("delete-preset"),presetId:z.string().max(200)}).strict(),
 z.object({action:z.literal("moderate"),generationId:z.string().max(200),isPublic:z.literal(false).optional(),reportId:z.string().max(200).optional()}).strict()
]);
export async function GET(request:Request){return api(async()=>{await requireAdmin(request);return repository().read(async tx=>({users:await tx.find("profiles",{},500),generations:(await tx.find("generations",{},500)).map(publicGeneration),reports:await tx.find("reports",{},500),presets:await tx.find("presets",{},500),pricing:await tx.find("model_pricing",{},500)}));});}
export async function POST(request:Request){return api(async()=>{
 assertSameOrigin(request);const admin=await requireAdmin(request);await rateLimit("admin",admin.id,60,60);const input=await body(request,schema);
 await repository().transaction(async tx=>{
  if(input.action==="adjust-credits"){const user=await tx.get("profiles",input.userId);if(!user)notFound();await changeCredits(tx,user,input.delta,input.bucket,"admin_adjustment",randomUUID(),admin.id+": "+input.note);}
  if(input.action==="toggle-model"||input.action==="set-price"){
   if(!getModel(input.modelId))throw new AppError("INVALID_MODEL","Choose a verified model.");
   const p=await tx.get("model_pricing",input.modelId)??{id:input.modelId,modelId:input.modelId,enabled:true,note:""};
   if(input.action==="toggle-model")p.enabled=input.enabled;else{p.usd=input.usd??undefined;p.note=input.note;}await tx.put("model_pricing",p);
  }
  if(input.action==="save-preset"){
   const model=getModel(input.preset.modelId);if(!model||model.surface!==input.preset.surface)throw new AppError("INVALID_MODEL","Choose a matching verified model.");
   const allowed=new Set(model.settings.map(s=>s.key));if(Object.keys(input.preset.settings).some(k=>!allowed.has(k)))throw new AppError("INVALID_SETTINGS","Preset contains unsupported settings.");
   await tx.put("presets",{...input.preset,id:input.preset.id??input.preset.slug});
  }
  if(input.action==="delete-preset"){const p=await tx.get("presets",input.presetId);if(!p)notFound();p.active=false;await tx.put("presets",p);}
  if(input.action==="moderate"){const g=await tx.get("generations",input.generationId);if(!g)notFound();g.isPublic=false;await tx.put("generations",g);if(input.reportId){const r=await tx.get("reports",input.reportId);if(r&&r.generationId===g.id){r.status="resolved";await tx.put("reports",r);}}}
 });return {ok:true};
});}
