import {describe,it,expect} from "vitest";
import {blankSnapshot,claimDrafts,restoreDrafts,DRAFT_TTL} from "../lib/client/draft-storage";
import {activeBatches,mergeRunUpdates} from "../lib/client/run-updates";
import {filterHistory} from "../lib/client/history";
import type {Generation} from "../lib/types";
const job=(id:string,status:Generation["status"],updatedAt="2026-10-17T01:00:00Z")=>({id,status,updatedAt,prompt:"A cobalt studio",modelId:"model-one"} as Generation);
describe("durable drafts",()=>{
 it("restores a recent prompt and owned references while rejecting external URLs",()=>{
  const saved={...blankSnapshot(),updatedAt:1000};saved.drafts.image={modelId:"one",prompt:"Keep this creative direction",settings:{ratio:"3:2"},media:[{id:"a",url:"/api/media/u/user/uploads/a.png",kind:"image",role:"reference"},{id:"b",url:"https://external.invalid/file",kind:"image",role:"reference"}]};
  const restored=restoreDrafts(saved,1001);expect(restored.drafts.image.prompt).toBe(saved.drafts.image.prompt);expect(restored.drafts.image.media.map(item=>item.id)).toEqual(["a"]);
 });
 it("expires old and future timestamps and tolerates corrupt storage",()=>{
  const saved={...blankSnapshot(),updatedAt:1000};saved.drafts.image.prompt="private draft";
  for(const value of [saved,null,"broken",{...saved,updatedAt:DRAFT_TTL+2000}])expect(restoreDrafts(value,DRAFT_TTL+1001).drafts.image.prompt).toBe("");
 });
 it("claims anonymous work, then clears it across account changes and logout",()=>{
  const saved=blankSnapshot();saved.drafts.video.prompt="Anonymous idea";
  const owned=claimDrafts(saved,"user-a");expect(owned.drafts.video.prompt).toBe("Anonymous idea");
  expect(claimDrafts(owned,"user-a").drafts.video.prompt).toBe("Anonymous idea");
  expect(claimDrafts(owned,"user-b").drafts.video.prompt).toBe("");expect(claimDrafts(owned,null).drafts.video.prompt).toBe("");
 });
});
describe("generation history consistency",()=>{
 it("ignores stale responses and never regresses completed runs to active",()=>{
  const complete=job("a","completed","2026-10-17T02:00:00Z"),running=job("b","in_progress","2026-10-17T02:00:00Z");
  expect(mergeRunUpdates([complete,running],[job("a","queued","2026-10-17T03:00:00Z"),job("b","queued")])).toEqual([complete,running]);
 });
 it("applies terminal results and removes deleted runs on a full reload",()=>{
  const complete=job("a","completed","2026-10-17T02:00:00Z");expect(mergeRunUpdates([job("a","queued"),job("b","queued")],[complete],true)).toEqual([complete]);
 });
 it("polls many active jobs in bounded batches and excludes terminal jobs",()=>{
  const runs=Array.from({length:121},(_,i)=>job(String(i),"queued"));runs.push(job("complete","completed"));
  expect(activeBatches(runs).map(batch=>batch.length)).toEqual([50,50,21]);
 });
 it("combines case-insensitive prompt/model search with status filters",()=>{
  const runs=[job("a","completed"),job("b","queued")];
  expect(filterHistory(runs,"active","COBALT").map(item=>item.id)).toEqual(["b"]);
  expect(filterHistory(runs,"completed","model-one").map(item=>item.id)).toEqual(["a"]);
 });
});
