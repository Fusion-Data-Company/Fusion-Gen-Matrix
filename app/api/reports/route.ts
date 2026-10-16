import {randomUUID} from "node:crypto";
import {z} from "zod";
import {api,body} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {assertSameOrigin,rateLimit} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {notFound} from "@/lib/errors";
export async function POST(request:Request){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request);await rateLimit("report",user.id,10,3600);
 const input=await body(request,z.object({generationId:z.string().max(200),reason:z.string().trim().min(5).max(1000)}).strict());
 await repository().transaction(async tx=>{const g=await tx.get("generations",input.generationId);if(!g?.isPublic)notFound();await tx.insert("reports",{id:randomUUID(),userId:user.id,generationId:g.id,reason:input.reason,status:"open",createdAt:new Date().toISOString()});});
 return {ok:true};
});}
