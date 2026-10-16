import {z} from "zod";
import {api,body} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {assertSameOrigin} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {notFound} from "@/lib/errors";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request),{id}=await context.params,input=await body(request,z.object({name:z.string().trim().min(1).max(80)}).strict());
 const project=await repository().transaction(async tx=>{const p=await tx.get("projects",id);if(!p||p.userId!==user.id)notFound();p.name=input.name;p.updatedAt=new Date().toISOString();await tx.put("projects",p);return p;});return {project};
});}
export async function DELETE(request:Request,context:Context){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request),{id}=await context.params;
 await repository().transaction(async tx=>{const p=await tx.get("projects",id);if(!p||p.userId!==user.id)notFound();const assets=await tx.find("generations",{userId:user.id,projectId:id},5000);for(const g of assets){g.projectId=undefined;await tx.put("generations",g);}await tx.remove("projects",id);});return {ok:true};
});}
