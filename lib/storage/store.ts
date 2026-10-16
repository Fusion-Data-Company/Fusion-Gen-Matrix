import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppError } from "../errors";
import { assertMediaKey, contentTypeForKey, parseMediaRange } from "./validation";

export interface MediaResponse { body:ReadableStream<Uint8Array>|Uint8Array;contentType:string;contentLength?:number;contentRange?:string;status:number }
export interface MediaStore {
 put(key:string,bytes:Uint8Array,contentType:string):Promise<void>;
 read(key:string,range?:string):Promise<MediaResponse>;
 remove(key:string):Promise<void>;
}
export class LocalMediaStore implements MediaStore {
 private readonly root:string;
 constructor(root:string){this.root=path.resolve(root);}
 private file(key:string){return path.join(this.root,assertMediaKey(key));}
 async put(key:string,bytes:Uint8Array,contentType:string):Promise<void>{
  if(contentTypeForKey(key)!==contentType)throw new AppError("MEDIA_TYPE_MISMATCH","The media type does not match its stored path.",415);
  const filename=this.file(key),temporary=filename+"."+randomUUID()+".tmp";
  await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  try{
   const handle=await open(temporary,"wx",0o600);
   try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
   await rename(temporary,filename);
  }catch(error){await rm(temporary,{force:true}).catch(()=>{});throw error;}
 }
 async read(key:string,range?:string):Promise<MediaResponse>{
  const filename=this.file(key);
  let details;
  try{details=await stat(filename);}catch{throw new AppError("MEDIA_NOT_FOUND","Media not found.",404);}
  if(!details.isFile())throw new AppError("MEDIA_NOT_FOUND","Media not found.",404);
  const requested=parseMediaRange(range,details.size);
  const stream=createReadStream(filename,requested);
  return {body:Readable.toWeb(stream) as ReadableStream<Uint8Array>,contentType:contentTypeForKey(key),contentLength:requested?requested.end-requested.start+1:details.size,
   contentRange:requested?`bytes ${requested.start}-${requested.end}/${details.size}`:undefined,status:requested?206:200};
 }
 async remove(key:string):Promise<void>{await rm(this.file(key),{force:true});}
}
export class R2MediaStore implements MediaStore {
 constructor(private readonly client:S3Client,private readonly bucket:string){
  if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))throw new Error("R2_BUCKET must be a valid bucket name.");
 }
 async put(key:string,bytes:Uint8Array,contentType:string):Promise<void>{
  assertMediaKey(key);
  if(contentTypeForKey(key)!==contentType)throw new AppError("MEDIA_TYPE_MISMATCH","The media type does not match its stored path.",415);
  try{await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:bytes,ContentType:contentType,ContentLength:bytes.byteLength,CacheControl:"private, no-store"}),{abortSignal:AbortSignal.timeout(120000)});}
  catch{throw new AppError("MEDIA_STORAGE_FAILED","The private media store could not save this file.",503);}
 }
 async read(key:string,range?:string):Promise<MediaResponse>{
  assertMediaKey(key);
  if(range&&!/^bytes=(?:\d+-\d*|-\d+)$/.test(range))throw new AppError("INVALID_RANGE","The requested byte range is unavailable.",416);
  try{
   const result=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key,Range:range}),{abortSignal:AbortSignal.timeout(120000)});
   if(!result.Body)throw new AppError("MEDIA_NOT_FOUND","Media not found.",404);
   return {body:result.Body.transformToWebStream() as ReadableStream<Uint8Array>,contentType:contentTypeForKey(key),contentLength:result.ContentLength,contentRange:result.ContentRange,status:result.ContentRange?206:200};
  }catch(error){
   if(error instanceof AppError)throw error;
   const name=error instanceof Error?error.name:"";
   if(name==="NoSuchKey"||name==="NotFound")throw new AppError("MEDIA_NOT_FOUND","Media not found.",404);
   if(name==="InvalidRange"||name==="RequestedRangeNotSatisfiable")throw new AppError("INVALID_RANGE","The requested byte range is unavailable.",416);
   throw new AppError("MEDIA_STORAGE_FAILED","The private media store could not read this file.",503);
  }
 }
 async remove(key:string):Promise<void>{
  assertMediaKey(key);
  try{await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:key}),{abortSignal:AbortSignal.timeout(30000)});}
  catch{throw new AppError("MEDIA_STORAGE_FAILED","The private media store could not remove this file.",503);}
 }
}
export function createR2Store():R2MediaStore{
 const account=process.env.R2_ACCOUNT_ID??"";
 if(!/^[a-f0-9]{32}$/i.test(account))throw new Error("R2_ACCOUNT_ID must be a Cloudflare account ID.");
 if(!process.env.R2_ACCESS_KEY_ID||!process.env.R2_SECRET_ACCESS_KEY||!process.env.R2_BUCKET)throw new Error("R2 credentials and bucket must be configured.");
 return new R2MediaStore(new S3Client({region:"auto",endpoint:`https://${account}.r2.cloudflarestorage.com`,
  credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},
  maxAttempts:3,requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"
 }),process.env.R2_BUCKET);
}
