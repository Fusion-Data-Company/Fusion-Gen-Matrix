import {api,body} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {assertSameOrigin,rateLimit} from "@/lib/auth/security";
import {inputSchema,generationService} from "@/lib/generations/service";
export async function POST(request:Request){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request);await rateLimit("quote",user.id,60,60);
 return generationService().quote(user.id,await body(request,inputSchema));
});}
