import "server-only";
import { z } from "zod";
import { AppError } from "../errors";
import type { Upload } from "../types";
import { HF_UPLOAD_TYPES, MEDIA_LIMITS, formatForType, normalizeContentType, sanitizeMediaName } from "./validation";

export interface DirectUploadInput { name:string;contentType:string;bytes:number }
export interface PendingDirectUpload extends Upload { status:"pending";expiresAt:string;r2Key:string;providerUrl:string }
export interface ReadyDirectUpload extends Upload { status:"ready";r2Key:string;providerUrl?:never }
export interface DirectUploadInstructions { uploadId:string;uploadUrl:string;headers:Record<string,string>;expiresAt:string }
export interface PreparedDirectUpload { upload:PendingDirectUpload;instructions:DirectUploadInstructions }
export interface DirectMediaAdapter {
 prepareDirectUpload(userId:string,input:DirectUploadInput):Promise<PreparedDirectUpload>;
 completeDirectUpload(upload:PendingDirectUpload):Promise<ReadyDirectUpload>;
}
export const directUploadRequestSchema=z.discriminatedUnion("stage",[
 z.object({stage:z.literal("prepare"),name:z.string().min(1).max(255),contentType:z.string().min(1).max(100),bytes:z.number().int().positive().max(MEDIA_LIMITS.video)}).strict(),
 z.object({stage:z.literal("complete"),uploadId:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)}).strict()
]);
export function validateDirectInput(input:DirectUploadInput):DirectUploadInput {
 const parsed=directUploadRequestSchema.safeParse({stage:"prepare",...input});
 if(!parsed.success||parsed.data.stage!=="prepare")throw new AppError("INVALID_UPLOAD","Choose a file with a valid name, type, and size.",400);
 const contentType=normalizeContentType(parsed.data.contentType);
 const format=formatForType(contentType);
 if(!HF_UPLOAD_TYPES.has(contentType))throw new AppError("UNSUPPORTED_PROVIDER_UPLOAD","Direct upload supports JPEG, PNG, WebP, GIF, MP4, and WAV files.",415);
 if(input.bytes>MEDIA_LIMITS[format.kind])throw new AppError("MEDIA_TOO_LARGE",`The ${format.kind} file exceeds the ${MEDIA_LIMITS[format.kind]/1024/1024} MiB limit.`,413);
 return {name:sanitizeMediaName(parsed.data.name),contentType,bytes:parsed.data.bytes};
}
export { configuredUploadOrigins } from "../upload-origins";
/** Metadata requests are capped while reading, even without Content-Length. */
export async function readDirectUploadRequest(request:Request):Promise<z.infer<typeof directUploadRequestSchema>>{
 if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new AppError("INVALID_CONTENT_TYPE","Send upload metadata as JSON.",415);
 const claimed=request.headers.get("content-length");
 if(claimed&&(!/^\d+$/.test(claimed)||Number(claimed)>4096))throw new AppError("BODY_TOO_LARGE","Upload metadata must be at most 4 KiB.",413);
 if(!request.body)throw new AppError("INVALID_JSON","Send valid upload metadata.",400);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new AppError("BODY_TOO_LARGE","Upload metadata must be at most 4 KiB.",413);}chunks.push(value);}
 }finally{reader.releaseLock();}
 let input:unknown;
 try{input=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,size)));}catch{throw new AppError("INVALID_JSON","Send valid upload metadata.",400);}
 const parsed=directUploadRequestSchema.safeParse(input);
 if(!parsed.success)throw new AppError("INVALID_INPUT","Send only the required upload stage, file metadata, or upload ID.",400);
 return parsed.data;
}
