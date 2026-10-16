import {api} from "@/lib/http";
import {demoLogout} from "@/lib/auth/server";
import {assertSameOrigin,assertLocalPreview} from "@/lib/auth/security";
export async function POST(request:Request){return api(async()=>{assertLocalPreview(request);assertSameOrigin(request);await demoLogout();return {ok:true};});}
