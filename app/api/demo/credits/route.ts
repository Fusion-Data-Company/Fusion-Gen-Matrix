import {randomUUID} from "node:crypto";
import {z} from "zod";
import {api,body} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {assertSameOrigin,assertLocalPreview,rateLimit} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {changeCredits} from "@/lib/billing/ledger";
import {notFound} from "@/lib/errors";
export async function POST(request:Request){return api(async()=>{
 assertLocalPreview(request);assertSameOrigin(request);const user=await requireUser(request);await body(request,z.object({amount:z.literal(100)}).strict());await rateLimit("preview-credits",user.id,20,60);
 return {user:await repository().transaction(async tx=>{const fresh=await tx.get("profiles",user.id);if(!fresh)notFound();return changeCredits(tx,fresh,100,"topup","preview_grant",randomUUID(),"Local preview credits. No payment.");})};
});}
