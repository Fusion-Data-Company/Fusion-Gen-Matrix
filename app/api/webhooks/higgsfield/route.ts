import {createHash} from "node:crypto";
import {after} from "next/server";
import {api} from "@/lib/http";
import {getEnv} from "@/lib/env";
import {verifyWebhookToken} from "@/lib/higgsfield/webhook";
import {generationService} from "@/lib/generations/service";
import {repository} from "@/lib/db/repository";
import {AppError,notFound} from "@/lib/errors";
export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){return api(async()=>{
 if(getEnv().APP_MODE!=="live")throw new AppError("WEBHOOK_DISABLED","Webhooks are disabled in preview.",503);
 const url=new URL(request.url),id=url.searchParams.get("gid")??"",token=url.searchParams.get("t")??"";
 if(!verifyWebhookToken(id,token,process.env.HF_WEBHOOK_SECRET!))throw new AppError("INVALID_WEBHOOK","Invalid webhook token.",401);
 if(Number(request.headers.get("content-length")??0)>100000)throw new AppError("BODY_TOO_LARGE","Webhook body is too large.",413);
 const text=await request.text();if(text.length>100000)throw new AppError("BODY_TOO_LARGE","Webhook body is too large.",413);
 const eventId=createHash("sha256").update(id+":"+text).digest("hex"),repo=repository();
 const g=await repo.read(tx=>tx.get("generations",id));if(!g)notFound();
 const pending=await repo.transaction(async tx=>{
  const existing=await tx.get("hf_webhook_events",eventId);
  if(existing)return !existing.processedAt;
  await tx.insert("hf_webhook_events",{id:eventId,type:"status-notification",createdAt:new Date().toISOString()});
  return true;
 });
 // Acknowledge only after saving the notification. Provider polling and durable
 // retention run after the response; pending generations also remain in the cron queue.
 if(pending)after(async()=>{
  try{
   // Never trust status, outputs, or URLs in the webhook body.
   await generationService().refresh(g.userId,g.id);
   await repo.transaction(async tx=>{const e=await tx.get("hf_webhook_events",eventId);if(e){e.processedAt=new Date().toISOString();await tx.put("hf_webhook_events",e);}});
  }catch{
   // Do not log callback URLs, tokens, provider URLs, or raw provider errors.
   console.error("Higgsfield notification remains unprocessed; pending generation reconciliation will retry.");
  }
 });
 return {ok:true};
});}
