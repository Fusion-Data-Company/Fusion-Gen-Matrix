import {z} from "zod";
import {api,body} from "@/lib/http";
import {demoLogin} from "@/lib/auth/server";
export async function POST(request:Request){return api(async()=>{const {email}=await body(request,z.object({email:z.email().max(254)}).strict());return {user:await demoLogin(email,request)};});}
