import {rateLimit} from "@/lib/auth/security";
import {api} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {repository} from "@/lib/db/repository";
import {publicGeneration} from "@/lib/serialize";
export const dynamic="force-dynamic";
export async function GET(request:Request){return api(async()=>{
 const user=await requireUser(request),ids=(new URL(request.url).searchParams.get("ids")??"").split(",").filter(x=>/^[A-Za-z0-9_-]{1,200}$/.test(x)).slice(0,50);
 await rateLimit("status",user.id,120,60);
 return {items:(await repository().read(tx=>tx.find("generations",{userId:user.id,id:{$in:ids},deletedAt:{$exists:false}},50))).map(publicGeneration)};
});}
