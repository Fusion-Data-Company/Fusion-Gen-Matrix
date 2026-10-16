import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Generation } from "../lib/types";
import type { SignedUpload } from "../lib/higgsfield/types";
import { FileRepository } from "../lib/db/repository";
import { DirectUploadCoordinator } from "../lib/storage/direct";
import { configuredUploadOrigins, readDirectUploadRequest, type DirectMediaAdapter, type PendingDirectUpload, type ReadyDirectUpload } from "../lib/storage/direct-contract";
import { MediaService, consumeBounded, readMedia, type MediaStore } from "../lib/storage";
import { LocalMediaStore, R2MediaStore } from "../lib/storage/store";
import { assertMediaKey, contentTypeForKey, formatForType, isPublicAddress, MEDIA_LIMITS, parseMediaRange, sniffMedia } from "../lib/storage/validation";
import { resolvePublicHttps, safeMediaRequest } from "../lib/storage/network";

const mocks=vi.hoisted(()=>({request:vi.fn(),lookup:vi.fn()}));
vi.mock("node:https",async(importOriginal)=>({...await importOriginal<typeof import("node:https")>(),request:mocks.request}));
vi.mock("node:dns/promises",async(importOriginal)=>({...await importOriginal<typeof import("node:dns/promises")>(),lookup:mocks.lookup}));

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
const generation:Generation={id:"g1",userId:"user1",surface:"image",modelId:"model",prompt:"Sample",settings:{},media:[],status:"in_progress",cost:4,debit:{subscription:4,topup:0},outputs:[],isPublic:false,createdAt:"2026-10-15T00:00:00Z",updatedAt:"2026-10-15T00:00:00Z",inputHash:"hash"};
const folders:string[]=[];
const memoryStore=()=>{
 const files=new Map<string,{bytes:Uint8Array;contentType:string}>();
 const store:MediaStore={
  put:vi.fn(async(key,bytes,contentType)=>{files.set(key,{bytes,contentType});}),
  read:vi.fn(async key=>{const found=files.get(key);if(!found)throw new Error("not found");return {body:found.bytes,contentType:found.contentType,status:200,contentLength:found.bytes.length};}),
  remove:vi.fn(async key=>{files.delete(key);})
 };
 return {store,files};
};
beforeEach(()=>{vi.unstubAllEnvs();mocks.request.mockReset();mocks.lookup.mockReset().mockResolvedValue([{address:"8.8.8.8",family:4}]);});
afterEach(async()=>{vi.unstubAllEnvs();vi.restoreAllMocks();for(const folder of folders.splice(0))await rm(folder,{recursive:true,force:true});});
async function temporary(){const folder=await mkdtemp(path.join(process.cwd(),".tool-cache","storage-test-"));folders.push(folder);return folder;}

describe("media validation",()=>{
 it("accepts actual PNG bytes and rejects a declared type mismatch",()=>{
  expect(sniffMedia(png,"image/png")).toEqual({kind:"image",contentType:"image/png",extension:"png"});
  expect(()=>sniffMedia(png,"image/jpeg")).toThrow("does not match");
  expect(sniffMedia(png,"application/octet-stream").kind).toBe("image");
 });
 it("rejects SVG, HTML, empty, and renamed text uploads",()=>{
  for(const content of ["<svg><script>alert(1)</script></svg>","<!doctype html><h1>hi</h1>","","not a png"])expect(()=>sniffMedia(Buffer.from(content),"image/png")).toThrow();
  expect(()=>formatForType("image/svg+xml")).toThrow();
 });
 it("recognizes supported containers, images and audio without trusting the filename",()=>{
  const gif=Buffer.alloc(13);gif.write("GIF89a");gif.writeUInt16LE(1,6);gif.writeUInt16LE(1,8);
  const webp=Buffer.alloc(20);webp.write("RIFF");webp.writeUInt32LE(12,4);webp.write("WEBPVP8 ",8);
  const wav=Buffer.alloc(44);wav.write("RIFF");wav.writeUInt32LE(36,4);wav.write("WAVEfmt ",8);wav.write("data",36);
  const mp4=Buffer.alloc(24);mp4.writeUInt32BE(24,0);mp4.write("ftypisom",4);
  const m4a=Buffer.from(mp4);m4a.write("M4A ",8);
  const mov=Buffer.from(mp4);mov.write("qt  ",8);
  const webm=Buffer.from([0x1a,0x45,0xdf,0xa3,...Buffer.from("........webm......")]);
  const ogg=Buffer.alloc(50);ogg.write("OggS");ogg.write("OpusHead",28);
  const samples:Array<[Buffer,string]>=[[Buffer.from([255,216,255,238,255,217]),"image/jpeg"],[gif,"image/gif"],[webp,"image/webp"],[wav,"audio/wav"],[mp4,"video/mp4"],[m4a,"audio/mp4"],[mov,"video/quicktime"],[webm,"video/webm"],[ogg,"audio/ogg"],[Buffer.from([255,251,144,100]),"audio/mpeg"]];
  for(const [bytes,type] of samples)expect(sniffMedia(bytes,type).contentType).toBe(type);
  expect(()=>sniffMedia(Buffer.from("ID3this is only a text header"),"audio/mpeg")).toThrow();
 });
 it("rejects traversal, encoded separators and arbitrary object keys",()=>{
  expect(assertMediaKey("u/user1/generations/g1/0.png")).toBe("u/user1/generations/g1/0.png");
  for(const key of ["../../.env","u/a/uploads/../../x.png","u/a/uploads/%2e%2e.png","u/a/uploads/a.html","/u/a/uploads/a.png","u/a/uploads/a.png?x=1","u/a//uploads/a.png"])expect(()=>assertMediaKey(key)).toThrow();
  expect(contentTypeForKey("u/a/generations/b/0.svg")).toBe("image/svg+xml");
 });
 it("handles normal, suffix and open byte ranges and rejects malformed or multi-ranges",()=>{
  expect(parseMediaRange("bytes=2-5",10)).toEqual({start:2,end:5});
  expect(parseMediaRange("bytes=-3",10)).toEqual({start:7,end:9});
  expect(parseMediaRange("bytes=8-",10)).toEqual({start:8,end:9});
  expect(parseMediaRange("bytes=0-99",10)).toEqual({start:0,end:9});
  for(const range of ["bytes=10-","bytes=4-2","bytes=-0","bytes=-","bytes=0-1,3-4","bytes=9007199254740993-"])expect(()=>parseMediaRange(range,10)).toThrow();
 });
});

describe("network restrictions",()=>{
 it("blocks private, reserved, mapped and IPv6 alternate-spelling addresses",()=>{
  const blocked=["127.0.0.1","10.0.1.2","100.64.0.1","169.254.169.254","172.16.1.1","192.168.1.1","192.0.2.1","198.19.0.1","198.51.100.2","203.0.113.2","224.0.0.1","255.255.255.255","::1","::ffff:127.0.0.1","fc00::1","fe80::1","ff02::1","2001:db8::1","2001:0db8::1","2001:0000::1","2002:7f00:1::1","3fff::1"];
  for(const value of blocked)expect(isPublicAddress(value),value).toBe(false);
  for(const value of ["8.8.8.8","1.1.1.1","2001:4860:4860::8888","2606:4700:4700::1111"])expect(isPublicAddress(value),value).toBe(true);
 });
 it("rejects local URLs, credentials, IP literals, non-HTTPS and unsafe DNS answers",async()=>{
  for(const url of ["http://media.example.com/a","https://127.0.0.1/a","https://[::1]/a","https://user:pass@media.example.com/a","https://media.local/a","https://media.example.com:8080/a","https://media.example.com/a#fragment","https://media.example.com./a"]){
   await expect(resolvePublicHttps(url,async()=>[{address:"8.8.8.8",family:4}])).rejects.toThrow();
  }
  await expect(resolvePublicHttps("https://media.example.com/a",async()=>[{address:"8.8.8.8",family:4},{address:"10.1.2.3",family:4}])).rejects.toThrow("permitted public");
  await expect(resolvePublicHttps("https://media.example.com/a",async()=>[])).rejects.toThrow();
 });
 it("optionally restricts provider responses to an exact configured hostname allowlist",async()=>{
  vi.stubEnv("HF_MEDIA_ALLOWED_HOSTS","media.example.com");
  await expect(resolvePublicHttps("https://other.example.com/a")).rejects.toThrow("allowlist");
  expect((await resolvePublicHttps("https://media.example.com/a")).address).toBe("8.8.8.8");
 });
 it("pins the actual HTTPS lookup to the validated address and retains signed PUT headers",async()=>{
  let options:Record<string,unknown>|undefined;
  mocks.request.mockImplementation((_url,opts,callback)=>{
   options=opts;
   const req=new EventEmitter() as EventEmitter&{end:ReturnType<typeof vi.fn>;destroy:ReturnType<typeof vi.fn>};
   req.destroy=vi.fn();req.end=vi.fn(()=>queueMicrotask(()=>{
    const response=Readable.from([]) as Readable&{statusCode:number;headers:Record<string,string>};
    response.statusCode=200;response.headers={"content-length":"0"};callback(response);
   }));return req;
  });
  await safeMediaRequest("https://media.example.com/upload?signature=opaque",{method:"PUT",body:png,headers:{"Content-Type":"image/png","x-amz-tagging":"retention=temporary"},maxBytes:1024});
  expect(options?.servername).toBe("media.example.com");
  expect(options?.agent).toBe(false);
  const callback=vi.fn();
  const lookup=options?.lookup as (h:string,o:{all?:boolean},c:ReturnType<typeof vi.fn>)=>void;
  lookup("media.example.com",{},callback);
  expect(callback).toHaveBeenCalledWith(null,"8.8.8.8",4);
  lookup("media.example.com",{all:true},callback);
  expect(callback).toHaveBeenLastCalledWith(null,[{address:"8.8.8.8",family:4}]);
  expect(options?.headers).toEqual({"Content-Type":"image/png","x-amz-tagging":"retention=temporary","Content-Length":String(png.length)});
 });
 it("rejects redirects, over-limit streams and credential forwarding",async()=>{
  for(const name of ["Authorization","Cookie","Proxy-Authorization","Host","Transfer-Encoding"]){
   await expect(safeMediaRequest("https://media.example.com/a",{headers:{[name]:"secret"},maxBytes:10})).rejects.toThrow("unsupported upload headers");
  }
  const respond=(status:number,body:Buffer,headers:Record<string,string>={})=>{
   mocks.request.mockImplementation((_url,_opts,callback)=>{
    const req=new EventEmitter() as EventEmitter&{end:()=>void;destroy:()=>void};
    req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const response=Readable.from([body]) as Readable&{statusCode:number;headers:Record<string,string>};response.statusCode=status;response.headers=headers;callback(response);});return req;
   });
  };
  respond(302,Buffer.alloc(0),{location:"https://127.0.0.1/secret"});
  await expect(safeMediaRequest("https://media.example.com/a",{maxBytes:10})).rejects.toThrow("direct response");
  respond(200,Buffer.alloc(11));
  await expect(safeMediaRequest("https://media.example.com/a",{maxBytes:10})).rejects.toThrow("size limit");
  respond(200,Buffer.alloc(0),{"content-length":"11"});
  await expect(safeMediaRequest("https://media.example.com/a",{maxBytes:10})).rejects.toThrow("size limit");
 });
});

describe("private media lifecycle",()=>{
 it("saves uploads locally, survives a new store instance, and supports ranged reads and deletion",async()=>{
  const folder=await temporary();
  const service=new MediaService({mode:"demo",store:new LocalMediaStore(folder),newId:()=>"upload1",now:()=>new Date("2026-10-15T00:00:00Z")});
  const uploaded=await service.saveUpload("user1",new File([png],"../sample.png",{type:"image/png"}));
  expect(uploaded).toMatchObject({id:"upload1",url:"/api/media/u/user1/uploads/upload1.png",r2Key:"u/user1/uploads/upload1.png",bytes:png.length,name:"..sample.png"});
  expect(uploaded.providerUrl).toBeUndefined();
  const second=new LocalMediaStore(folder);
  const response=await second.read(uploaded.r2Key,"bytes=0-7");
  expect(response).toMatchObject({status:206,contentType:"image/png",contentRange:`bytes 0-7/${png.length}`,contentLength:8});
  expect(Buffer.from(await consumeBounded(response.body,100))).toEqual(png.subarray(0,8));
  await service.removeMedia([uploaded.r2Key,uploaded.r2Key]);
  await expect(second.read(uploaded.r2Key)).rejects.toMatchObject({status:404});
 });
 it("rejects oversized uploads before reading bytes and empty uploads before storage",async()=>{
  const {store}=memoryStore(),service=new MediaService({mode:"demo",store});
  const read=vi.fn();
  await expect(service.saveUpload("u1",{type:"image/png",size:MEDIA_LIMITS.image+1,arrayBuffer:read} as unknown as File)).rejects.toMatchObject({status:413});
  await expect(service.saveUpload("u1",new File([],"empty.png",{type:"image/png"}))).rejects.toThrow("containing media");
  expect(read).not.toHaveBeenCalled();expect(store.put).not.toHaveBeenCalled();
 });
 it("uploads owned saved bytes using only the provider's signed-upload instructions",async()=>{
  const {store,files}=memoryStore(),key="u/user1/uploads/one.png";files.set(key,{bytes:png,contentType:"image/png"});
  const provider={signedUpload:vi.fn(async()=>({uploadUrl:"https://storage.example.com/signed",publicUrl:"https://media.example.com/file.png",contentType:"image/png",headers:{"Content-Type":"image/png","x-amz-tagging":"retention=temporary"}}))};
  const transfer=vi.fn<typeof safeMediaRequest>(async()=>({bytes:Buffer.alloc(0),contentType:"application/octet-stream",status:200}));
  const service=new MediaService({mode:"live",store,provider,transfer});
  expect(await service.getProviderMediaUrl({r2Key:key,contentType:"image/png"})).toBe("https://media.example.com/file.png");
  expect(provider.signedUpload).toHaveBeenCalledWith("image/png");
  expect(transfer.mock.calls[0]?.[1]).toMatchObject({method:"PUT",headers:{"Content-Type":"image/png","x-amz-tagging":"retention=temporary"},body:png});
  await expect(service.getProviderMediaUrl({r2Key:"u/user1/uploads/a.mp3",contentType:"audio/mpeg"})).rejects.toThrow("Convert");
 });
 it("retains every provider output, rejects corrupt responses and reuses deterministic keys on retry",async()=>{
  const {store,files}=memoryStore(),transfer=vi.fn(async()=>({bytes:png,contentType:"image/png",status:200}));
  const service=new MediaService({mode:"live",store,transfer});
  const outputs=[{kind:"image" as const,url:"https://media.example.com/1.png"},{kind:"image" as const,url:"https://media.example.com/2.png"}];
  const saved=await service.retainOutputs(generation,outputs);
  expect(saved.map(x=>x.r2Key)).toEqual(["u/user1/generations/g1/0.png","u/user1/generations/g1/1.png"]);
  await service.retainOutputs(generation,outputs);expect(files.size).toBe(2);
  await expect(service.retainOutputs(generation,[])).rejects.toThrow("without downloadable");
  await expect(service.retainOutputs(generation,[{kind:"artifact",url:"https://media.example.com/a.zip"}])).rejects.toThrow("artifact");
  transfer.mockResolvedValueOnce({bytes:Buffer.from("<html>error</html>"),contentType:"text/html",status:200});
  await expect(service.retainOutputs(generation,outputs)).rejects.toThrow("supported media");
 });
 it("does not report completion when a later private-storage write fails",async()=>{
  const {store}=memoryStore();vi.mocked(store.put).mockResolvedValueOnce().mockRejectedValueOnce(new Error("storage unavailable"));
  const service=new MediaService({mode:"live",store,transfer:async()=>({bytes:png,contentType:"image/png",status:200})});
  await expect(service.retainOutputs(generation,[{kind:"image",url:"https://media.example.com/1"},{kind:"image",url:"https://media.example.com/2"}])).rejects.toThrow("storage unavailable");
  expect(store.put).toHaveBeenCalledTimes(2);
 });
 it("creates only explicit trusted sample SVGs and never fabricates a video or live result",async()=>{
  const {store,files}=memoryStore();
  const service=new MediaService({mode:"demo",store});
  const [output]=await service.createDemoOutput({...generation,prompt:"<script>injection()</script>"});
  const text=Buffer.from(files.get(output.r2Key)!.bytes).toString();
  expect(text).toContain("LOCAL PREVIEW SAMPLE");expect(text).not.toContain("injection");expect(text).not.toContain("<script");
  await expect(service.createDemoOutput({...generation,surface:"video"})).rejects.toThrow("fixture");
  await expect(service.createDemoOutput({...generation,surface:"audio"})).rejects.toThrow("No standalone audio");
  await expect(new MediaService({mode:"live",store}).createDemoOutput(generation)).rejects.toMatchObject({status:403});
 });
 it("retains the original local video fixture as a playable MP4",async()=>{
  const {store,files}=memoryStore();
  const service=new MediaService({mode:"demo",store,demoVideoPath:path.join(process.cwd(),"public","fixtures","demo-motion.mp4")});
  const [output]=await service.createDemoOutput({...generation,surface:"video"});
  expect(output).toMatchObject({kind:"video",contentType:"video/mp4",r2Key:"u/user1/generations/g1/0.mp4"});
  expect(sniffMedia(files.get(output.r2Key)!.bytes,"video/mp4").kind).toBe("video");
 });
 it("refuses private storage access in public showcase mode",()=>{
  vi.stubEnv("APP_MODE","showcase");
  expect(()=>readMedia("u/user1/uploads/one.png")).toThrow("Private media storage is unavailable");
 });
 it("bounds streams even when the content length is absent",async()=>{
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(5));controller.enqueue(new Uint8Array(6));controller.close();}});
  await expect(consumeBounded(stream,10)).rejects.toMatchObject({status:413});
 });
 it("uses private R2 objects, streams reads and handles missing keys without exposing SDK errors",async()=>{
  const client=new S3Client({region:"auto",credentials:{accessKeyId:"test",secretAccessKey:"test"}});
  const send=vi.spyOn(client,"send");
  send.mockResolvedValueOnce({} as never);
  const store=new R2MediaStore(client,"studio-media");
  await store.put("u/user1/uploads/one.png",png,"image/png");
  const command=send.mock.calls[0][0] as PutObjectCommand;
  expect(command.input).toMatchObject({Bucket:"studio-media",Key:"u/user1/uploads/one.png",ContentType:"image/png",CacheControl:"private, no-store"});
  expect(command.input).not.toHaveProperty("ACL");
  send.mockResolvedValueOnce({Body:{transformToWebStream:()=>new ReadableStream()},ContentLength:8,ContentRange:"bytes 0-7/64"} as never);
  expect(await store.read("u/user1/uploads/one.png","bytes=0-7")).toMatchObject({contentLength:8,contentRange:"bytes 0-7/64",status:206});
  send.mockRejectedValueOnce(Object.assign(new Error("private endpoint and credentials"),{name:"NoSuchKey"}));
  await expect(store.read("u/user1/uploads/one.png")).rejects.toMatchObject({status:404,message:"Media not found."});
  send.mockRejectedValueOnce(new Error("secret"));
  await expect(store.put("u/user1/uploads/one.png",png,"image/png")).rejects.toMatchObject({status:503,message:"The private media store could not save this file."});
 });
});

describe("direct upload metadata and origins",()=>{
 it("rejects arbitrary URLs, object keys, malformed JSON and non-JSON requests",async()=>{
  const req=(value:unknown,contentType="application/json")=>new Request("https://studio.example.com/api/uploads/direct",{method:"POST",headers:{"Content-Type":contentType},body:typeof value==="string"?value:JSON.stringify(value)});
  expect(await readDirectUploadRequest(req({stage:"prepare",name:"a.png",contentType:"image/png",bytes:png.length}))).toMatchObject({stage:"prepare",bytes:png.length});
  expect(await readDirectUploadRequest(req({stage:"complete",uploadId:"one"}))).toEqual({stage:"complete",uploadId:"one"});
  for(const value of [{stage:"complete",uploadId:"one",providerUrl:"https://attacker.example.com"},{stage:"prepare",name:"a.png",contentType:"image/png",bytes:png.length,r2Key:"u/other/uploads/a.png"},{stage:"complete",uploadId:"../one"}]){
   await expect(readDirectUploadRequest(req(value))).rejects.toMatchObject({status:400});
  }
  await expect(readDirectUploadRequest(req("not JSON"))).rejects.toMatchObject({code:"INVALID_JSON"});
  await expect(readDirectUploadRequest(req("{}","text/plain"))).rejects.toMatchObject({status:415});
 });
 it("caps metadata while streaming when Content-Length is absent",async()=>{
  const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(4096));controller.enqueue(new Uint8Array(1));controller.close();}});
  const request=new Request("https://studio.example.com/api/uploads/direct",{method:"POST",headers:{"Content-Type":"application/json"},body,duplex:"half"} as RequestInit);
  await expect(readDirectUploadRequest(request)).rejects.toMatchObject({status:413});
 });
 it("requires exact configured public HTTPS origins without wildcard or URL payloads",()=>{
  expect(configuredUploadOrigins(["https://storage.example.com","https://storage.example.com/"])).toEqual(["https://storage.example.com"]);
  for(const values of [[],["https://*.example.com"],["http://storage.example.com"],["https://storage.example.com/path"],["https://secret@storage.example.com"],["https://127.0.0.1"],["https://storage.local"],["https://storage.example.com?token=opaque"]])expect(()=>configuredUploadOrigins(values)).toThrow();
 });
});
describe("direct upload preparation and completion",()=>{
 const now=()=>new Date("2026-10-15T15:00:00Z");
 const signed:SignedUpload={uploadUrl:"https://storage.example.com/upload?signature=opaque",publicUrl:"https://media.example.com/input.png",contentType:"image/png",headers:{"Content-Type":"image/png","x-amz-tagging":"retention=temporary"}};
 const pending:PendingDirectUpload={id:"upload1",userId:"user1",kind:"image",name:"a.png",url:"",contentType:"image/png",bytes:png.length,createdAt:now().toISOString(),providerUrl:signed.publicUrl,r2Key:"u/user1/uploads/upload1.png",status:"pending",expiresAt:"2026-10-15T16:00:00Z"};
 const ready:ReadyDirectUpload={id:pending.id,userId:pending.userId,kind:pending.kind,name:pending.name,url:"/api/media/u/user1/uploads/upload1.png",r2Key:pending.r2Key,contentType:pending.contentType,bytes:pending.bytes,createdAt:pending.createdAt,status:"ready",expiresAt:pending.expiresAt};
 it("prepares scoped instructions while persisting only server-owned pending metadata",async()=>{
  const {store}=memoryStore(),provider={signedUpload:vi.fn(async()=>signed)};
  const service=new MediaService({mode:"live",store,provider,newId:()=>"upload1",now,uploadOrigins:["https://storage.example.com"]});
  const prepared=await service.prepareDirectUpload("user1",{name:"../safe.png",contentType:"image/png",bytes:png.length});
  expect(prepared.instructions).toEqual({uploadId:"upload1",uploadUrl:signed.uploadUrl,headers:signed.headers,expiresAt:"2026-10-15T16:00:00.000Z"});
  expect(prepared.upload).toMatchObject({id:"upload1",userId:"user1",status:"pending",url:"",providerUrl:signed.publicUrl,r2Key:"u/user1/uploads/upload1.png",name:"..safe.png"});
  expect(store.put).not.toHaveBeenCalled();
  expect(prepared.instructions).not.toHaveProperty("providerUrl");
  expect(prepared.instructions.headers).not.toHaveProperty("Authorization");
 });
 it("rejects absent origin setup, unsupported types and oversize metadata before provider calls",async()=>{
  const {store}=memoryStore(),provider={signedUpload:vi.fn(async()=>signed)};
  const service=new MediaService({mode:"live",store,provider,uploadOrigins:[]});
  await expect(service.prepareDirectUpload("user1",{name:"a.png",contentType:"image/png",bytes:png.length})).rejects.toMatchObject({code:"DIRECT_UPLOAD_NOT_CONFIGURED",status:503});
  await expect(service.prepareDirectUpload("user1",{name:"a.mp3",contentType:"audio/mpeg",bytes:100})).rejects.toMatchObject({status:415});
  await expect(service.prepareDirectUpload("user1",{name:"a.png",contentType:"image/png",bytes:MEDIA_LIMITS.image+1})).rejects.toMatchObject({status:413});
  expect(provider.signedUpload).not.toHaveBeenCalled();
 });
 it("rejects returned origin mismatches and unsafe signed headers before exposing instructions",async()=>{
  const {store}=memoryStore(),provider={signedUpload:vi.fn(async()=>signed)};
  const service=new MediaService({mode:"live",store,provider,uploadOrigins:["https://other.example.com"]});
  await expect(service.prepareDirectUpload("user1",{name:"a.png",contentType:"image/png",bytes:png.length})).rejects.toMatchObject({code:"UPLOAD_ORIGIN_NOT_ALLOWED",status:503});
  try{await service.prepareDirectUpload("user1",{name:"a.png",contentType:"image/png",bytes:png.length});}catch(error){expect((error as Error).message).not.toContain("signature");}
  const valid=new MediaService({mode:"live",store,provider,uploadOrigins:["https://storage.example.com"]});
  provider.signedUpload.mockResolvedValueOnce({...signed,headers:{...signed.headers,Authorization:"must-not-forward"}});
  await expect(valid.prepareDirectUpload("user1",{name:"a.png",contentType:"image/png",bytes:png.length})).rejects.toMatchObject({code:"UNSAFE_UPLOAD_HEADERS"});
  provider.signedUpload.mockResolvedValueOnce({...signed,headers:{"Content-Type":"image/jpeg","x-amz-tagging":"retention=temporary"}});
  await expect(valid.prepareDirectUpload("user1",{name:"a.png",contentType:"image/png",bytes:png.length})).rejects.toMatchObject({code:"UNSAFE_UPLOAD_HEADERS"});
 });
 it("validates downloaded size, signature and type before durable retention",async()=>{
  const {store,files}=memoryStore(),transfer=vi.fn<typeof safeMediaRequest>(async()=>({bytes:png,contentType:"image/png",status:200}));
  const service=new MediaService({mode:"live",store,transfer,now});
  const result=await service.completeDirectUpload(pending);
  expect(result).toMatchObject({status:"ready",url:ready.url,r2Key:pending.r2Key,bytes:png.length});
  expect(transfer).toHaveBeenCalledWith(signed.publicUrl,{maxBytes:png.length,timeoutMs:120000});
  expect(files.get(pending.r2Key)?.bytes).toEqual(png);
  transfer.mockResolvedValueOnce({bytes:png.subarray(0,png.length-1),contentType:"image/png",status:200});
  await expect(service.completeDirectUpload(pending)).rejects.toMatchObject({code:"UPLOAD_SIZE_MISMATCH"});
  transfer.mockResolvedValueOnce({bytes:Buffer.alloc(png.length),contentType:"image/png",status:200});
  await expect(service.completeDirectUpload(pending)).rejects.toMatchObject({code:"INVALID_MEDIA_BYTES"});
  await expect(service.completeDirectUpload({...pending,r2Key:"u/other/uploads/upload1.png"})).rejects.toMatchObject({code:"INVALID_UPLOAD_STATE"});
  await expect(service.completeDirectUpload({...pending,expiresAt:"2026-10-15T14:00:00Z"})).rejects.toMatchObject({code:"UPLOAD_EXPIRED"});
 });

 it("reuses verified private bytes instead of the browser-writable temporary provider URL",async()=>{
  const {store}=memoryStore();
  const serverSigned:SignedUpload={...signed,uploadUrl:"https://storage.example.com/server-upload?signature=server",publicUrl:"https://media.example.com/verified-input.png"};
  const provider={signedUpload:vi.fn(async()=>serverSigned)};
  const transfer=vi.fn<typeof safeMediaRequest>().mockResolvedValueOnce({bytes:png,contentType:"image/png",status:200}).mockResolvedValueOnce({bytes:Buffer.alloc(0),contentType:"application/octet-stream",status:200});
  const service=new MediaService({mode:"live",store,provider,transfer,now});
  const completed=await service.completeDirectUpload(pending);
  expect(completed).not.toHaveProperty("providerUrl");
  expect(await service.getProviderMediaUrl(completed)).toBe(serverSigned.publicUrl);
  expect(provider.signedUpload).toHaveBeenCalledWith("image/png");
  expect(store.read).toHaveBeenCalledWith(pending.r2Key);
  expect(transfer.mock.calls[1]).toEqual([serverSigned.uploadUrl,expect.objectContaining({method:"PUT",body:png,headers:serverSigned.headers})]);
  expect(transfer.mock.calls.filter(([url])=>url===pending.providerUrl)).toHaveLength(1);
 });
 it("keeps pending uploads unusable until completion and returns a ready record on replay",async()=>{
  const folder=await temporary(),repo=new FileRepository(folder),adapter:DirectMediaAdapter={
   prepareDirectUpload:vi.fn(async()=>({upload:pending,instructions:{uploadId:pending.id,uploadUrl:signed.uploadUrl,headers:signed.headers,expiresAt:pending.expiresAt}})),
   completeDirectUpload:vi.fn(async()=>ready)
  };
  const coordinator=new DirectUploadCoordinator(repo,adapter,now);
  expect(await coordinator.prepare("user1",{name:"a.png",contentType:"image/png",bytes:png.length})).toMatchObject({uploadId:"upload1"});
  expect(await repo.read(tx=>tx.get("uploads","upload1"))).toMatchObject({status:"pending",url:""});
  await expect(coordinator.complete("other","upload1")).rejects.toMatchObject({status:404});
  expect(adapter.completeDirectUpload).not.toHaveBeenCalled();
  expect(await coordinator.complete("user1","upload1")).toMatchObject({status:"ready",url:ready.url});
  expect(await coordinator.complete("user1","upload1")).toMatchObject({status:"ready"});
  expect(adapter.completeDirectUpload).toHaveBeenCalledTimes(1);
  expect(await repo.read(tx=>tx.get("uploads","upload1"))).not.toHaveProperty("finalizingToken");
 });
 it("serializes concurrent completion and releases a failed retention lease for retry",async()=>{
  const folder=await temporary(),repo=new FileRepository(folder);
  await repo.transaction(tx=>tx.insert("uploads",pending));
  let finish!:(value:ReadyDirectUpload)=>void,started!:()=>void;
  const active=new Promise<void>(resolve=>{started=resolve;});
  const adapter:DirectMediaAdapter={prepareDirectUpload:vi.fn(),completeDirectUpload:vi.fn(async()=>{started();return await new Promise<ReadyDirectUpload>(resolve=>{finish=resolve;});})};
  const coordinator=new DirectUploadCoordinator(repo,adapter,now),first=coordinator.complete("user1","upload1");
  await active;
  await expect(coordinator.complete("user1","upload1")).rejects.toMatchObject({code:"UPLOAD_FINALIZING",status:409});
  finish(ready);await first;
  expect(adapter.completeDirectUpload).toHaveBeenCalledTimes(1);
  await repo.transaction(tx=>tx.put("uploads",pending));
  vi.mocked(adapter.completeDirectUpload).mockRejectedValueOnce(new Error("retention failed")).mockResolvedValueOnce(ready);
  await expect(coordinator.complete("user1","upload1")).rejects.toThrow("retention failed");
  expect(await repo.read(tx=>tx.get("uploads","upload1"))).toMatchObject({status:"pending"});
  expect(await repo.read(tx=>tx.get("uploads","upload1"))).not.toHaveProperty("finalizingToken");
  expect(await coordinator.complete("user1","upload1")).toMatchObject({status:"ready"});
 });
 it("rejects expired pending records before retention and allows an expired ready record replay",async()=>{
  const folder=await temporary(),repo=new FileRepository(folder),adapter:DirectMediaAdapter={prepareDirectUpload:vi.fn(),completeDirectUpload:vi.fn()};
  await repo.transaction(tx=>tx.insert("uploads",{...pending,expiresAt:"2026-10-15T14:00:00Z"}));
  const coordinator=new DirectUploadCoordinator(repo,adapter,now);
  await expect(coordinator.complete("user1","upload1")).rejects.toMatchObject({status:410});
  expect(adapter.completeDirectUpload).not.toHaveBeenCalled();
  await repo.transaction(tx=>tx.put("uploads",{...ready,expiresAt:"2026-10-15T14:00:00Z"}));
  expect(await coordinator.complete("user1","upload1")).toMatchObject({status:"ready"});
 });
});
