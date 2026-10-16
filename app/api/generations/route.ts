import {api,body} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {assertSameOrigin,rateLimit} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {createSchema,generationService} from "@/lib/generations/service";
import {publicGeneration} from "@/lib/serialize";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request){return api(async()=>{
 const user=await requireUser(request),url=new URL(request.url),query:Record<string,unknown>={userId:user.id,deletedAt:{$exists:false}};
 const surface=url.searchParams.get("surface");if(surface&&["image","video","audio"].includes(surface))query.surface=surface;
 const projectId=url.searchParams.get("projectId");if(projectId)query.projectId=projectId;
 const cursor=url.searchParams.get("cursor");if(cursor&&/^\d{4}-\d{2}-\d{2}T/.test(cursor))query.createdAt={$lt:cursor};
 const limit=Math.max(1,Math.min(1000,Number(url.searchParams.get("limit")??600)||600));
 const records=await repository().read(tx=>tx.find("generations",query,limit+1));
 return {items:records.slice(0,limit).map(publicGeneration),nextCursor:records.length>limit?records[limit-1].createdAt:null};
});}
export async function POST(request:Request){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request);await rateLimit("generation",user.id,30,60);
 const {idempotencyKey,...input}=await body(request,createSchema);
 const generation=await generationService().create(user.id,input,idempotencyKey);
 return {generation:publicGeneration(generation)};
});}
