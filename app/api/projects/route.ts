import {randomUUID} from "node:crypto";
import {z} from "zod";
import {api,body} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {assertSameOrigin} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {AppError} from "@/lib/errors";
export async function GET(request:Request){return api(async()=>{const user=await requireUser(request);return {items:await repository().read(tx=>tx.find("projects",{userId:user.id},500))};});}
export async function POST(request:Request){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request),input=await body(request,z.object({name:z.string().trim().min(1).max(80)}).strict());
 const now=new Date().toISOString(),project={id:randomUUID(),userId:user.id,name:input.name,createdAt:now,updatedAt:now};
 await repository().transaction(async tx=>{if((await tx.find("projects",{userId:user.id},501)).length>=500)throw new AppError("PROJECT_LIMIT","Archive a project before creating another.",409);await tx.insert("projects",project);});return {project};
});}
