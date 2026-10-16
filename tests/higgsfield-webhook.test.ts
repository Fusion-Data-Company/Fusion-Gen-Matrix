import fs from "node:fs/promises";
import path from "node:path";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {POST,maxDuration} from "@/app/api/webhooks/higgsfield/route";
import {FileRepository,type Repository} from "@/lib/db/repository";
import {createWebhookToken} from "@/lib/higgsfield/webhook";
import type {Generation} from "@/lib/types";

const mocks=vi.hoisted(()=>({
 after:vi.fn<(callback:()=>Promise<void>)=>void>(),
 repository:vi.fn<()=>Repository>(),
 refresh:vi.fn<(userId:string,id:string)=>Promise<Generation>>(),
 mode:"live"
}));
vi.mock("next/server",async importOriginal=>({...await importOriginal<typeof import("next/server")>(),after:mocks.after}));
vi.mock("@/lib/db/repository",async importOriginal=>({...await importOriginal<typeof import("@/lib/db/repository")>(),repository:mocks.repository}));
vi.mock("@/lib/generations/service",()=>({generationService:()=>({refresh:mocks.refresh})}));
vi.mock("@/lib/env",()=>({getEnv:()=>({APP_MODE:mocks.mode})}));

const secret="webhook-test-secret-".repeat(3);
const generation:Generation={
 id:"generation-1",userId:"owner-1",surface:"image",modelId:"alibaba/qwen-image-3/text-to-image",
 prompt:"A ceramic cup",settings:{},media:[],status:"queued",requestId:"provider-request-1",
 cost:4,debit:{subscription:4,topup:0},outputs:[],isPublic:false,
 createdAt:"2026-10-16T00:00:00.000Z",updatedAt:"2026-10-16T00:00:00.000Z",inputHash:"persisted-input-hash"
};
const notification=JSON.stringify({status:"completed",request_id:"attacker-request",outputs:[{url:"http://127.0.0.1/private"}]});
let dir:string,repo:FileRepository,tasks:Array<()=>Promise<void>>;
function request(token=createWebhookToken(generation.id,secret)){
 return new Request("https://studio.example.test/api/webhooks/higgsfield?gid="+generation.id+"&t="+token,{method:"POST",body:notification});
}
function deferred<T>(){
 let resolve!:(value:T)=>void;
 const promise=new Promise<T>(done=>{resolve=done;});
 return {promise,resolve};
}
beforeEach(async()=>{
 vi.stubEnv("HF_WEBHOOK_SECRET",secret);
 mocks.mode="live";mocks.after.mockReset();mocks.repository.mockReset();mocks.refresh.mockReset();
 tasks=[];mocks.after.mockImplementation(callback=>{tasks.push(callback);});
 const cache=path.join(process.cwd(),".tool-cache");await fs.mkdir(cache,{recursive:true});
 dir=await fs.mkdtemp(path.join(cache,"higgsfield-webhook-test-"));repo=new FileRepository(dir);
 mocks.repository.mockReturnValue(repo);mocks.refresh.mockResolvedValue(generation);
 await repo.transaction(tx=>tx.insert("generations",generation));
});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllEnvs();await fs.rm(dir,{recursive:true,force:true});});

describe("Higgsfield webhook acknowledgement",()=>{
 it("persists before acknowledging and does not wait for provider status or retention",async()=>{
  const provider=deferred<Generation>();mocks.refresh.mockReturnValue(provider.promise);
  const response=await POST(request());
  expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true});
  const events=await repo.read(tx=>tx.find("hf_webhook_events"));
  expect(events).toHaveLength(1);expect(events[0].processedAt).toBeUndefined();
  expect(mocks.refresh).not.toHaveBeenCalled();expect(tasks).toHaveLength(1);
  const background=tasks[0]();
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith("owner-1","generation-1");
  expect((await repo.read(tx=>tx.get("hf_webhook_events",events[0].id)))?.processedAt).toBeUndefined();
  provider.resolve({...generation,status:"completed"});await background;
  expect((await repo.read(tx=>tx.get("hf_webhook_events",events[0].id)))?.processedAt).toBeTruthy();
  // Callback status, request ID and output URLs never become authoritative state.
  expect(await repo.read(tx=>tx.get("generations",generation.id))).toMatchObject({status:"queued",requestId:"provider-request-1",outputs:[]});
  expect(maxDuration).toBe(300);
 });
 it("leaves a failed background notification unprocessed and its generation reconcilable",async()=>{
  const errorLog=vi.spyOn(console,"error").mockImplementation(()=>{});
  mocks.refresh.mockRejectedValue(new Error("sensitive-provider-error-and-token"));
  expect((await POST(request())).status).toBe(200);
  await expect(tasks[0]()).resolves.toBeUndefined();
  const events=await repo.read(tx=>tx.find("hf_webhook_events"));
  expect(events).toHaveLength(1);expect(events[0].processedAt).toBeUndefined();
  expect(await repo.read(tx=>tx.get("generations",generation.id))).toMatchObject({status:"queued",outputs:[]});
  expect(errorLog).toHaveBeenCalledExactlyOnceWith("Higgsfield notification remains unprocessed; pending generation reconciliation will retry.");
 });
 it("does not rerun a processed delivery",async()=>{
  expect((await POST(request())).status).toBe(200);await tasks[0]();
  expect((await POST(request())).status).toBe(200);
  expect(tasks).toHaveLength(1);expect(mocks.refresh).toHaveBeenCalledTimes(1);
  expect(await repo.read(tx=>tx.find("hf_webhook_events"))).toHaveLength(1);
 });
 it("allows redelivery to retry a saved notification that failed",async()=>{
  vi.spyOn(console,"error").mockImplementation(()=>{});
  mocks.refresh.mockRejectedValueOnce(new Error("temporary failure"));
  expect((await POST(request())).status).toBe(200);await tasks[0]();
  expect((await POST(request())).status).toBe(200);await tasks[1]();
  const events=await repo.read(tx=>tx.find("hf_webhook_events"));
  expect(events).toHaveLength(1);expect(events[0].processedAt).toBeTruthy();
  expect(mocks.refresh).toHaveBeenCalledTimes(2);
 });
 it("rejects an invalid token before reading state or scheduling work",async()=>{
  const response=await POST(request("invalid"));
  expect(response.status).toBe(401);expect(await response.json()).toMatchObject({code:"INVALID_WEBHOOK"});
  expect(mocks.repository).not.toHaveBeenCalled();expect(mocks.after).not.toHaveBeenCalled();expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it("does not acknowledge or schedule work when durable insertion fails",async()=>{
  vi.spyOn(repo,"transaction").mockRejectedValueOnce(new Error("database unavailable"));
  const response=await POST(request());
  expect(response.status).toBe(500);expect(mocks.after).not.toHaveBeenCalled();expect(mocks.refresh).not.toHaveBeenCalled();
  expect(await repo.read(tx=>tx.find("hf_webhook_events"))).toHaveLength(0);
 });
 it("does not execute callbacks in showcase mode",async()=>{
  mocks.mode="showcase";
  expect((await POST(request())).status).toBe(503);
  expect(mocks.repository).not.toHaveBeenCalled();expect(mocks.after).not.toHaveBeenCalled();
 });
});
