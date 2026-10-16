import {getEnv} from "@/lib/env";
import {z} from "zod";
import {api,body} from "@/lib/http";
import {currentUser,requireUser} from "@/lib/auth/server";
import {assertSameOrigin,rateLimit} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {generationService,activeStatuses} from "@/lib/generations/service";
import {publicGeneration,communityGeneration} from "@/lib/serialize";
import {AppError,notFound} from "@/lib/errors";
import {removeMedia} from "@/lib/storage";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return api(async()=>{
 if(getEnv().APP_MODE==="showcase")notFound();
 const {id}=await context.params,user=await currentUser(request),g=await repository().read(tx=>tx.get("generations",id));
 if(!g||g.deletedAt||(!g.isPublic&&g.userId!==user?.id))notFound();return {generation:g.userId===user?.id?publicGeneration(g):communityGeneration(g)};
});}
export async function POST(request:Request,context:Context){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request),{id}=await context.params;
 const input=await body(request,z.object({action:z.enum(["cancel","refresh","publish","unpublish","delete","move"]),projectId:z.string().max(200).nullable().optional()}).strict());
 const service=generationService(),g=await service.owned(user.id,id,input.action==="delete");
 if(input.action==="refresh"){await rateLimit("refresh",user.id,30,60);return {generation:publicGeneration(await service.refresh(user.id,id)),ok:true};}
 if(input.action==="cancel")return {generation:publicGeneration(await service.cancel(user.id,id)),ok:true};
 if(input.action==="delete"){
  if(activeStatuses.includes(g.status as typeof activeStatuses[number]))throw new AppError("GENERATION_ACTIVE","Cancel this generation before deleting it.",409);
  await repository().transaction(async tx=>{const current=await tx.get("generations",id);if(!current||current.userId!==user.id)notFound();await tx.put("generations",{...current,isPublic:false,deletedAt:new Date().toISOString()});});
  await removeMedia(g.outputs.map(o=>o.r2Key));return {ok:true};
 }
 const next=await repository().transaction(async tx=>{
  const current=await tx.get("generations",id);if(!current||current.userId!==user.id||current.deletedAt)notFound();
  if(input.action==="publish"){if(current.status!=="completed")throw new AppError("NOT_COMPLETE","Only completed media can be published.",409);current.isPublic=true;current.publishedAt=new Date().toISOString();}
  if(input.action==="unpublish")current.isPublic=false;
  if(input.action==="move"){if(input.projectId){const project=await tx.get("projects",input.projectId);if(!project||project.userId!==user.id)notFound();}current.projectId=input.projectId??undefined;}
  current.updatedAt=new Date().toISOString();await tx.put("generations",current);return current;
 });
 return {generation:publicGeneration(next),ok:true};
});}
