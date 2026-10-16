import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../env";
import { AppError } from "../errors";
import type { Generation, Output, Upload } from "../types";
import { HiggsfieldClient } from "../higgsfield/client";
import type { ProviderOutput, SignedUpload } from "../higgsfield/types";
import { safeMediaRequest, safeUploadHeaders, resolvePublicHttps } from "./network";
import { createR2Store, LocalMediaStore, type MediaResponse, type MediaStore } from "./store";
import { assertIdentifier, assertMediaKey, HF_UPLOAD_TYPES, MEDIA_LIMITS, mediaUrl, formatForType, normalizeContentType, sanitizeMediaName, sniffMedia } from "./validation";

import { configuredUploadOrigins, validateDirectInput, type DirectUploadInput, type PendingDirectUpload, type PreparedDirectUpload, type ReadyDirectUpload } from "./direct-contract";
export type { MediaResponse, MediaStore } from "./store";
export { mediaUrl, assertMediaKey, MEDIA_LIMITS } from "./validation";
export interface StoredUpload extends Upload { r2Key:string; providerUrl?:string }
interface ProviderUploader { signedUpload(contentType:string):Promise<SignedUpload> }
type Transfer=typeof safeMediaRequest;
export interface MediaServiceOptions {
 mode:"demo"|"live";store:MediaStore;provider?:ProviderUploader;transfer?:Transfer;
 demoVideoPath?:string;now?:()=>Date;newId?:()=>string;uploadOrigins?:string[];
}
export class MediaService {
 private readonly transfer:Transfer;
 private readonly now:()=>Date;
 private readonly newId:()=>string;
 constructor(private readonly options:MediaServiceOptions){
  this.transfer=options.transfer??safeMediaRequest;this.now=options.now??(()=>new Date());this.newId=options.newId??randomUUID;
 }
 async saveUpload(userId:string,file:File):Promise<StoredUpload>{
  assertIdentifier(userId);
  const claimed=formatForType(file.type);
  if(!file.size)throw new AppError("EMPTY_UPLOAD","Choose a file containing media.",400);
  if(file.size>MEDIA_LIMITS[claimed.kind])throw new AppError("MEDIA_TOO_LARGE",`The ${claimed.kind} file exceeds the ${MEDIA_LIMITS[claimed.kind]/1024/1024} MiB limit.`,413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.byteLength!==file.size)throw new AppError("INVALID_UPLOAD","The upload size changed while it was read.",400);
  const format=sniffMedia(bytes,file.type);
  const id=assertIdentifier(this.newId()),key=`u/${userId}/uploads/${id}.${format.extension}`;
  await this.options.store.put(key,bytes,format.contentType);
  return {id,userId,kind:format.kind,name:sanitizeMediaName(file.name),url:mediaUrl(key),r2Key:key,contentType:format.contentType,bytes:bytes.byteLength,createdAt:this.now().toISOString()};
 }
 async prepareDirectUpload(userId:string,value:DirectUploadInput):Promise<PreparedDirectUpload>{
  if(this.options.mode!=="live")throw new AppError("DIRECT_UPLOAD_UNAVAILABLE","Direct upload requires the live services.",503);
  assertIdentifier(userId);const input=validateDirectInput(value);
  const origins=configuredUploadOrigins(this.options.uploadOrigins);
  if(!this.options.provider)throw new AppError("PROVIDER_NOT_CONFIGURED","The media provider is not configured.",503);
  const createdAt=this.now(),signed=await this.options.provider.signedUpload(input.contentType);
  if(normalizeContentType(signed.contentType)!==input.contentType)throw new AppError("INVALID_PROVIDER_UPLOAD","The provider returned a different upload media type.",502);
  const headers=safeUploadHeaders(signed.headers,input.contentType,true);
  let uploadOrigin:string;
  try{uploadOrigin=new URL(signed.uploadUrl).origin;}catch{throw new AppError("INVALID_PROVIDER_UPLOAD","The provider returned an invalid upload URL.",502);}
  if(!origins.includes(uploadOrigin))throw new AppError("UPLOAD_ORIGIN_NOT_ALLOWED","Add the verified upload origin "+uploadOrigin+" to HF_UPLOAD_ORIGINS and the studio's connect-src policy before retrying.",503);
  await resolvePublicHttps(signed.uploadUrl);await resolvePublicHttps(signed.publicUrl);
  const id=assertIdentifier(this.newId()),format=formatForType(input.contentType),r2Key=`u/${userId}/uploads/${id}.${format.extension}`;
  const expiresAt=new Date(createdAt.getTime()+3600000).toISOString();
  const upload:PendingDirectUpload={id,userId,kind:format.kind,name:input.name,url:"",r2Key,providerUrl:signed.publicUrl,contentType:input.contentType,bytes:input.bytes,createdAt:createdAt.toISOString(),status:"pending",expiresAt};
  return {upload,instructions:{uploadId:id,uploadUrl:signed.uploadUrl,headers,expiresAt}};
 }
 async completeDirectUpload(upload:PendingDirectUpload):Promise<ReadyDirectUpload>{
  if(this.options.mode!=="live")throw new AppError("DIRECT_UPLOAD_UNAVAILABLE","Direct upload requires the live services.",503);
  assertIdentifier(upload.userId);assertIdentifier(upload.id);
  if(upload.status!=="pending"||!upload.providerUrl||!upload.expiresAt||!Number.isFinite(Date.parse(upload.expiresAt)))throw new AppError("INVALID_UPLOAD_STATE","This upload cannot be completed.",409);
  if(Date.parse(upload.expiresAt)<=this.now().getTime())throw new AppError("UPLOAD_EXPIRED","This upload expired. Select the file again to start a new upload.",410);
  const input=validateDirectInput({name:upload.name,contentType:upload.contentType,bytes:upload.bytes}),format=formatForType(input.contentType);
  const expectedKey=`u/${upload.userId}/uploads/${upload.id}.${format.extension}`;
  if(upload.r2Key!==expectedKey||upload.kind!==format.kind)throw new AppError("INVALID_UPLOAD_STATE","The upload's private storage path is invalid.",409);
  // The URL is loaded from the owned database record, never from request JSON.
  const received=await this.transfer(upload.providerUrl,{maxBytes:input.bytes,timeoutMs:120000});
  if(received.bytes.byteLength!==input.bytes)throw new AppError("UPLOAD_SIZE_MISMATCH","The uploaded file size does not match its metadata. Start a new upload.",400);
  const actual=sniffMedia(received.bytes,received.contentType);
  if(actual.contentType!==input.contentType)throw new AppError("MEDIA_TYPE_MISMATCH","The uploaded file does not match its declared media type.",415);
  await this.options.store.put(expectedKey,received.bytes,actual.contentType);
  // The browser PUT remains writable until expiry. A ready upload keeps only
  // verified private bytes; a new generation prepares a fresh server upload.
  return {id:upload.id,userId:upload.userId,kind:actual.kind,name:input.name,url:mediaUrl(expectedKey),r2Key:expectedKey,contentType:actual.contentType,bytes:received.bytes.byteLength,createdAt:upload.createdAt,status:"ready",expiresAt:upload.expiresAt};
 }
 async getProviderMediaUrl(media:{r2Key:string;contentType:string;providerUrl?:string}):Promise<string>{
  assertMediaKey(media.r2Key);
  if(this.options.mode==="demo")return mediaUrl(media.r2Key);
  if(media.providerUrl)return media.providerUrl;
  const contentType=normalizeContentType(media.contentType);
  if(!HF_UPLOAD_TYPES.has(contentType))throw new AppError("UNSUPPORTED_PROVIDER_UPLOAD","This provider upload endpoint accepts JPEG, PNG, WebP, GIF, MP4, or WAV. Convert this file before using it as an input.",415);
  if(!this.options.provider)throw new AppError("PROVIDER_NOT_CONFIGURED","The media provider is not configured.",503);
  const stored=await this.options.store.read(media.r2Key);
  const bytes=await consumeBounded(stored.body,MEDIA_LIMITS[formatForType(contentType).kind]);
  sniffMedia(bytes,contentType);
  const signed=await this.options.provider.signedUpload(contentType);
  if(normalizeContentType(signed.contentType)!==contentType)throw new AppError("INVALID_PROVIDER_UPLOAD","The provider returned a different upload media type.",502);
  await this.transfer(signed.uploadUrl,{method:"PUT",headers:signed.headers,body:bytes,maxBytes:64*1024,timeoutMs:120000});
  return signed.publicUrl;
 }
 async retainOutputs(generation:Generation,outputs:ProviderOutput[]):Promise<Output[]>{
  assertIdentifier(generation.userId);assertIdentifier(generation.id);
  if(outputs.length===0)throw new AppError("MISSING_PROVIDER_MEDIA","The provider completed without downloadable media.",502);
  if(outputs.length>32)throw new AppError("TOO_MANY_PROVIDER_OUTPUTS","The provider returned more media than this request can retain.",502);
  if(outputs.some(output=>output.kind==="artifact"))throw new AppError("UNSUPPORTED_PROVIDER_ARTIFACT","This result includes a non-media artifact. Retention is pending until an artifact handler is configured.",502);
  const saved:Output[]=[];
  // Persist every output before the caller transitions the generation to completed.
  // Fixed keys make a partial-retention retry safe; existing private objects are replaced.
  for(let index=0;index<outputs.length;index++){
   const output=outputs[index];
   if(output.kind==="artifact")throw new AppError("UNSUPPORTED_PROVIDER_ARTIFACT","Unsupported provider output.",502);
   const received=await this.transfer(output.url,{maxBytes:MEDIA_LIMITS[output.kind],timeoutMs:120000});
   const format=sniffMedia(received.bytes,received.contentType);
   if(format.kind!==output.kind)throw new AppError("PROVIDER_MEDIA_TYPE_MISMATCH","The provider result has a different media type than expected.",502);
   const key=`u/${generation.userId}/generations/${generation.id}/${index}.${format.extension}`;
   await this.options.store.put(key,received.bytes,format.contentType);
   saved.push({kind:format.kind,url:mediaUrl(key),r2Key:key,contentType:format.contentType,width:output.width,height:output.height,durationSec:output.durationSec});
  }
  return saved;
 }
 async createDemoOutput(generation:Generation):Promise<Output[]>{
  if(this.options.mode!=="demo")throw new AppError("PREVIEW_ONLY","Sample outputs are only available in local preview mode.",403);
  assertIdentifier(generation.userId);assertIdentifier(generation.id);
  let bytes:Uint8Array,contentType:string,extension:string;
  if(generation.surface==="video"){
   if(!this.options.demoVideoPath)throw new AppError("DEMO_VIDEO_MISSING","The local sample video fixture is not installed.",503);
   try{bytes=new Uint8Array(await readFile(this.options.demoVideoPath));}catch{throw new AppError("DEMO_VIDEO_MISSING","The local sample video fixture is not installed.",503);}
   const format=sniffMedia(bytes,"video/mp4");contentType=format.contentType;extension=format.extension;
  }else if(generation.surface==="audio"){
   throw new AppError("DEMO_AUDIO_UNAVAILABLE","No standalone audio generation model is verified in the current provider catalog.",422);
  }else{
   // This original, fixed SVG contains no user text, scripting, external resources,
   // links, animation or foreignObject. It is a sample asset, never an AI result.
   const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960" viewBox="0 0 1280 960"><rect width="1280" height="960" fill="#151a15"/><path d="M0 720L760 0H1280V960H0Z" fill="#252e22"/><ellipse cx="640" cy="720" rx="310" ry="64" fill="#0a1009"/><path d="M420 280H780L860 680H500Z" fill="#cbf58a"/><path d="M420 280L570 160H930L780 280Z" fill="#e6ffc0"/><path d="M780 280L930 160L1010 560L860 680Z" fill="#83a94e"/><circle cx="470" cy="610" r="125" fill="#e5d5c1"/><path d="M470 485A125 125 0 0 1 470 735Z" fill="#bba88f"/><text x="54" y="76" fill="#e8f1e1" font-family="Arial,sans-serif" font-size="25" letter-spacing="5">FUSION GEN MATRIX</text><text x="54" y="866" fill="#cbf58a" font-family="Arial,sans-serif" font-size="30">LOCAL PREVIEW SAMPLE</text><text x="54" y="908" fill="#b8c1b1" font-family="Arial,sans-serif" font-size="21">Illustrative fixture. No AI generation or provider charge.</text></svg>';
   bytes=Buffer.from(svg);contentType="image/svg+xml";extension="svg";
  }
  const key=`u/${generation.userId}/generations/${generation.id}/0.${extension}`;
  await this.options.store.put(key,bytes,contentType);
  return [{kind:generation.surface,url:mediaUrl(key),r2Key:key,contentType,...(generation.surface==="image"?{width:1280,height:960}:{})}];
 }
 readMedia(key:string,range?:string):Promise<MediaResponse>{return this.options.store.read(assertMediaKey(key),range);}
 async removeMedia(keys:string[]):Promise<void>{
  if(keys.length>100)throw new AppError("TOO_MANY_MEDIA_KEYS","Remove no more than 100 media files in one request.",400);
  const unique=[...new Set(keys.map(assertMediaKey))];
  for(const key of unique)await this.options.store.remove(key);
 }
}
/** Consumes only bounded private-store media; never accepts arbitrary remote URLs. */
export async function consumeBounded(body:ReadableStream<Uint8Array>|Uint8Array,limit:number):Promise<Uint8Array>{
 if(body instanceof Uint8Array){if(body.byteLength>limit)throw new AppError("MEDIA_TOO_LARGE","The media exceeds its size limit.",413);return body;}
 const reader=body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>limit){await reader.cancel();throw new AppError("MEDIA_TOO_LARGE","The media exceeds its size limit.",413);}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks,size);
}
function service():MediaService{
 const env=getEnv();
 if(env.APP_MODE==="showcase")throw new AppError("STORAGE_NOT_CONFIGURED","Private media storage is unavailable in this showcase. Configure the live services to enable uploads and generation.",503);
 if(env.APP_MODE==="demo")return new MediaService({mode:"demo",store:new LocalMediaStore(path.join(env.DATA_DIR,"media")),demoVideoPath:path.join(process.cwd(),"public","fixtures","demo-motion.mp4")});
 return new MediaService({mode:"live",store:createR2Store(),provider:new HiggsfieldClient({credentials:process.env.HF_CREDENTIALS??"",baseUrl:env.HF_API_BASE_URL})});
}
export function saveUpload(userId:string,file:File){return service().saveUpload(userId,file);}
export function retainOutputs(generation:Generation,outputs:ProviderOutput[]){return service().retainOutputs(generation,outputs);}
export function createDemoOutput(generation:Generation){return service().createDemoOutput(generation);}
export function getProviderMediaUrl(media:{r2Key:string;contentType:string;providerUrl?:string}){return service().getProviderMediaUrl(media);}
export function readMedia(key:string,range?:string){return service().readMedia(key,range);}
export function removeMedia(keys:string[]){return service().removeMedia(keys);}

export function prepareDirectUpload(userId:string,input:DirectUploadInput){return service().prepareDirectUpload(userId,input);}
export function completeDirectUpload(upload:PendingDirectUpload){return service().completeDirectUpload(upload);}
