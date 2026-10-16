import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {FileRepository} from "../lib/db/repository";
import {debit,refund} from "../lib/billing/ledger";
import {GenerationService,type GenerationInput} from "../lib/generations/service";
import {HiggsfieldError} from "../lib/higgsfield/client";
import type {Generation,Profile,Output} from "../lib/types";
let dir:string,repo:FileRepository;
const profile:Profile={id:"owner",email:"owner@example.test",name:"Owner",role:"user",plan:"plus",subscriptionCredits:8,topupCredits:12,createdAt:"2026-10-15T00:00:00.000Z"};
const input:GenerationInput={modelId:"alibaba/qwen-image-3/text-to-image",prompt:"An original studio photograph of a ceramic cup.",settings:{},media:[]};
const output:Output={kind:"image",url:"/api/media/u/owner/generations/sample/0.png",r2Key:"u/owner/generations/sample/0.png",contentType:"image/png"};
function engine(options:{mode?:"demo"|"live";submitError?:Error;retainError?:boolean}={}){
 const provider={estimate:vi.fn(async()=>({usd:0.02,providerCredits:"2"})),
  submit:vi.fn(async()=>{if(options.submitError)throw options.submitError;return {requestId:"request-1",status:"queued" as const,outputs:[]};}),
  status:vi.fn(async()=>({requestId:"request-1",status:"completed" as const,outputs:[{kind:"image" as const,url:"https://cdn.example.test/output.png"}]})),
  cancel:vi.fn(async()=>({requestId:"request-1",status:"canceled" as const,outputs:[]}))};
 const retain=vi.fn(async()=>{if(options.retainError)throw new Error("Storage unavailable");return [output];});
 const mediaUrl=vi.fn(async()=>"https://cdn.example.test/input.png");
 return {provider,retain,mediaUrl,service:new GenerationService({repo,mode:options.mode??"demo",provider,retain,demoRetain:retain,mediaUrl,markup:2,creditUsd:0.01,maxUsd:5})};
}

function deferred<T>(){
 let resolve!:(value:T|PromiseLike<T>)=>void,reject!:(reason?:unknown)=>void;
 const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});
 return {promise,resolve,reject};
}
beforeEach(async()=>{dir=await fs.mkdtemp(path.join(process.env.TEST_TMP_DIR??"/tmp","fusion-generation-"));repo=new FileRepository(dir);await repo.transaction(tx=>tx.insert("profiles",profile));});
afterEach(async()=>{await fs.rm(dir,{recursive:true,force:true});});
describe("atomic credits and generation lifecycle",()=>{
 it("concurrent debits cannot overdraw and consume subscription credits first",async()=>{
  const outcomes=await Promise.allSettled(Array.from({length:12},(_,i)=>repo.transaction(async tx=>debit(tx,(await tx.get("profiles","owner"))!,4,"charge-"+i))));
  expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(5);
  const user=await repo.read(tx=>tx.get("profiles","owner"));expect(user?.subscriptionCredits).toBe(0);expect(user?.topupCredits).toBe(0);
  const ledger=await repo.read(tx=>tx.find("credit_ledger"));expect(ledger.reduce((sum,x)=>sum+x.delta,0)).toBe(-20);
 });
 it("same idempotency key reserves once under concurrent submissions",async()=>{
  const {service}=engine(),key=randomUUID();const results=await Promise.all([service.create("owner",input,key),service.create("owner",input,key)]);
  expect(results[0].id).toBe(results[1].id);expect(await repo.read(tx=>tx.find("generations"))).toHaveLength(1);
  expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(4);
 });
 it("reusing a key for changed input fails without another debit",async()=>{
  const {service}=engine(),key=randomUUID();await service.create("owner",input,key);
  await expect(service.create("owner",{...input,prompt:"Changed prompt"},key)).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 });
 it("enforces model settings on the server before charging",async()=>{
  const {service}=engine();await expect(service.create("owner",{...input,settings:{resolution:"not-a-resolution"}},randomUUID())).rejects.toMatchObject({code:"INVALID_INPUT"});
  expect(await repo.read(tx=>tx.find("credit_ledger"))).toHaveLength(0);
 });
 it("does not accept another owner's uploads or projects",async()=>{
  await repo.transaction(async tx=>{await tx.insert("uploads",{id:"foreign",userId:"other",name:"x.png",url:"/private",r2Key:"u/other/uploads/x.png",kind:"image",contentType:"image/png",bytes:20,createdAt:profile.createdAt});await tx.insert("projects",{id:"foreign-project",userId:"other",name:"Secret",createdAt:profile.createdAt,updatedAt:profile.createdAt});});
  const {service}=engine();await expect(service.create("owner",{...input,media:[{id:"foreign",role:"reference"}]},randomUUID())).rejects.toMatchObject({status:404});
  await expect(service.create("owner",{...input,projectId:"foreign-project"},randomUUID())).rejects.toMatchObject({status:404});
 });
 it("cancellation refunds once despite repeated events",async()=>{
  const {service}=engine(),g=await service.create("owner",input,randomUUID());
  await service.cancel("owner",g.id);await service.cancel("owner",g.id);
  const user=await repo.read(tx=>tx.get("profiles","owner"));expect(user?.subscriptionCredits).toBe(8);
  expect((await repo.read(tx=>tx.find("credit_ledger",{reason:"generation_refund"})))).toHaveLength(1);
 });
 it.each(["failed","nsfw"] as const)("%s state and duplicate notifications refund once",async status=>{
  const {service}=engine(),g=await service.create("owner",input,randomUUID());
  const result={requestId:g.requestId!,status,outputs:[]};await service.apply(g,result);await service.apply(g,result);
  expect((await repo.read(tx=>tx.get("generations",g.id)))?.status).toBe(status);
  expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(8);
 });
 it("stores outputs before completion and survives a repository restart",async()=>{
  const {service}=engine(),g=await service.create("owner",input,randomUUID());
  await service.apply(g,{requestId:g.requestId!,status:"completed",outputs:[]});
  const fresh=new FileRepository(dir);const saved=await fresh.read(tx=>tx.get("generations",g.id));
  expect(saved?.status).toBe("completed");expect(saved?.outputs).toEqual([output]);
 });
 it("retention failure keeps a retriable state without refunding paid output",async()=>{
  const {service}=engine({retainError:true}),g=await service.create("owner",input,randomUUID());
  const retained=await service.apply(g,{requestId:g.requestId!,status:"completed",outputs:[]});
  expect(retained.status).toBe("in_progress");expect(retained.retentionError).toBeTruthy();
  expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(4);
  const retry=engine();const done=await retry.service.apply(retained,{requestId:g.requestId!,status:"completed",outputs:[]});expect(done.status).toBe("completed");
 });

 it.each(["failure","finish"] as const)("fences an expired worker's %s while a newer retention lease is active",async outcome=>{
  const {service,retain}=engine({mode:"live"}),g=await service.create("owner",{...input,maxCredits:4},randomUUID());
  const firstStarted=deferred<void>(),secondStarted=deferred<void>(),first=deferred<Output[]>(),second=deferred<Output[]>();
  retain.mockImplementationOnce(()=>{firstStarted.resolve(undefined);return first.promise;})
   .mockImplementationOnce(()=>{secondStarted.resolve(undefined);return second.promise;});
  const result={requestId:g.requestId!,status:"completed" as const,outputs:[]};
  const staleRun=service.apply(g,result);await firstStarted.promise;
  // Advance the persisted deadline instead of relying on wall-clock sleeps.
  await repo.transaction(async tx=>{const current=(await tx.get("generations",g.id))!;await tx.put("generations",{...current,finalizingUntil:new Date(Date.now()-1).toISOString()});});
  const freshRun=service.apply(g,result);await secondStarted.promise;
  const freshLease=(await repo.read(tx=>tx.get("generations",g.id)))!;
  if(outcome==="failure")first.reject(new Error("Expired worker failed"));
  else first.resolve([{...output,url:"/stale-output",r2Key:"u/owner/generations/stale/0.png"}]);
  await staleRun;
  const afterStale=(await repo.read(tx=>tx.get("generations",g.id)))!;
  expect(afterStale.finalizingToken).toBe(freshLease.finalizingToken);
  expect(afterStale.finalizingUntil).toBe(freshLease.finalizingUntil);
  expect(afterStale.status).not.toBe("completed");
  expect(afterStale.outputs).toEqual([]);
  expect(afterStale.retentionError).toBeUndefined();
  second.resolve([output]);
  expect(await freshRun).toMatchObject({status:"completed",outputs:[output]});
  expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(4);
  expect(await repo.read(tx=>tx.find("credit_ledger",{reason:"generation_refund"}))).toHaveLength(0);
 });
 it.each(["failure","finish"] as const)("does not resurrect a refunded cancellation after retention %s",async outcome=>{
  const {service,retain}=engine(),g=await service.create("owner",input,randomUUID());
  const started=deferred<void>(),pending=deferred<Output[]>();
  retain.mockImplementationOnce(()=>{started.resolve(undefined);return pending.promise;});
  const retaining=service.apply(g,{requestId:g.requestId!,status:"completed",outputs:[]});
  await started.promise;
  expect(await service.cancel("owner",g.id)).toMatchObject({status:"canceled"});
  if(outcome==="failure")pending.reject(new Error("Storage failed after cancellation"));else pending.resolve([output]);
  expect(await retaining).toMatchObject({status:"canceled",outputs:[]});
  expect((await repo.read(tx=>tx.get("generations",g.id)))?.status).toBe("canceled");
  expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(8);
  expect(await repo.read(tx=>tx.find("credit_ledger",{reason:"generation_refund"}))).toHaveLength(1);
 });
 it("rejects deleted generation references before provider upload, quote, or debit",async()=>{
  const {service,provider,mediaUrl}=engine({mode:"live"}),g=await service.create("owner",{...input,maxCredits:4},randomUUID());
  await service.apply(g,{requestId:g.requestId!,status:"completed",outputs:[]});
  await repo.transaction(async tx=>{const current=(await tx.get("generations",g.id))!;await tx.put("generations",{...current,deletedAt:new Date().toISOString(),isPublic:false});});
  provider.estimate.mockClear();provider.submit.mockClear();mediaUrl.mockClear();
  const edit:GenerationInput={...input,modelId:"alibaba/qwen-image-3/edit",media:[{id:g.id,role:"reference"}],maxCredits:4};
  await expect(service.quote("owner",edit)).rejects.toMatchObject({status:404});
  await expect(service.create("owner",edit,randomUUID())).rejects.toMatchObject({status:404});
  expect(provider.estimate).not.toHaveBeenCalled();expect(provider.submit).not.toHaveBeenCalled();expect(mediaUrl).not.toHaveBeenCalled();
  expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(4);
  expect(await repo.read(tx=>tx.find("generations"))).toHaveLength(1);
 });
 it("allows only the owner to retrieve a tombstone explicitly for deletion cleanup",async()=>{
  const {service}=engine(),g=await service.create("owner",input,randomUUID());
  await service.apply(g,{requestId:g.requestId!,status:"completed",outputs:[]});
  await repo.transaction(async tx=>{const current=(await tx.get("generations",g.id))!;await tx.put("generations",{...current,deletedAt:new Date().toISOString(),isPublic:false});});
  await expect(service.owned("owner",g.id)).rejects.toMatchObject({status:404});
  await expect(service.owned("other",g.id,true)).rejects.toMatchObject({status:404});
  expect(await service.owned("owner",g.id,true)).toMatchObject({id:g.id,userId:"owner",outputs:[output]});
 });
 it("ambiguous provider submission remains reserved for same-key reconciliation",async()=>{
  const {service}=engine({mode:"live",submitError:new HiggsfieldError("Timeout",{ambiguous:true})});
  const g=await service.create("owner",{...input,maxCredits:4},randomUUID());
  expect(g.status).toBe("pending_submit");expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(4);
 });
 it("definitive provider rejection refunds the reservation",async()=>{
  const {service}=engine({mode:"live",submitError:new HiggsfieldError("Rejected",{status:422,ambiguous:false})});
  const g=await service.create("owner",{...input,maxCredits:4},randomUUID());expect(g.status).toBe("failed");expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(8);
 });
 it("requires a current client ceiling and rejects price changes before debit",async()=>{
  const {service}=engine({mode:"live"});
  await expect(service.create("owner",input,randomUUID())).rejects.toMatchObject({code:"QUOTE_REQUIRED"});
  await expect(service.create("owner",{...input,maxCredits:3},randomUUID())).rejects.toMatchObject({code:"PRICE_CHANGED"});
  expect(await repo.read(tx=>tx.find("credit_ledger"))).toHaveLength(0);
 });
 it("deletion retains the billing tombstone and prevents request-key reuse",async()=>{
  const {service}=engine(),key=randomUUID(),g=await service.create("owner",input,key);
  await service.apply(g,{requestId:g.requestId!,status:"completed",outputs:[]});
  await repo.transaction(async tx=>{const done=(await tx.get("generations",g.id))!;await tx.put("generations",{...done,deletedAt:new Date().toISOString(),isPublic:false});});
  await expect(service.create("owner",{...input,prompt:"Changed"},key)).rejects.toMatchObject({code:"GENERATION_DELETED"});
  expect((await repo.read(tx=>tx.get("profiles","owner")))?.subscriptionCredits).toBe(4);
 });
 it("other-user status and cancellation return 404",async()=>{
  const {service}=engine(),g=await service.create("owner",input,randomUUID());
  await expect(service.owned("other",g.id)).rejects.toMatchObject({status:404});await expect(service.cancel("other",g.id)).rejects.toMatchObject({status:404});
 });
 it("refund restores the original buckets, including a split debit",async()=>{
  const allocation=await repo.transaction(async tx=>debit(tx,(await tx.get("profiles","owner"))!,10,"split"));
  const g={id:"split",userId:"owner",debit:allocation.allocation} as Generation;
  await repo.transaction(tx=>refund(tx,g));await repo.transaction(tx=>refund(tx,g));
  const user=await repo.read(tx=>tx.get("profiles","owner"));expect(user?.subscriptionCredits).toBe(8);expect(user?.topupCredits).toBe(12);
 });
});
