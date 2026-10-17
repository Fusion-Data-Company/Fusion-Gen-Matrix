import "server-only";
import { isIP } from "node:net";
import { AppError } from "../errors";
import {ARTIFACT_TYPES} from "./artifacts";
import type { Surface } from "../types";

export const MEDIA_LIMITS: Readonly<Record<Surface, number>> = { image: 20 * 1024 * 1024, video: 200 * 1024 * 1024, audio: 50 * 1024 * 1024 };
export interface MediaFormat { kind: Surface; contentType: string; extension: string }
const formats: Record<string, MediaFormat> = {
 "image/jpeg": {kind:"image",contentType:"image/jpeg",extension:"jpg"},
 "image/png": {kind:"image",contentType:"image/png",extension:"png"},
 "image/webp": {kind:"image",contentType:"image/webp",extension:"webp"},
 "image/gif": {kind:"image",contentType:"image/gif",extension:"gif"},
 "video/mp4": {kind:"video",contentType:"video/mp4",extension:"mp4"},
 "video/quicktime": {kind:"video",contentType:"video/quicktime",extension:"mov"},
 "video/webm": {kind:"video",contentType:"video/webm",extension:"webm"},
 "audio/mpeg": {kind:"audio",contentType:"audio/mpeg",extension:"mp3"},
 "audio/wav": {kind:"audio",contentType:"audio/wav",extension:"wav"},
 "audio/ogg": {kind:"audio",contentType:"audio/ogg",extension:"ogg"},
 "audio/mp4": {kind:"audio",contentType:"audio/mp4",extension:"m4a"}
};
const aliases: Record<string, string> = {"image/jpg":"image/jpeg","audio/x-wav":"audio/wav","audio/wave":"audio/wav","audio/mp3":"audio/mpeg","audio/x-m4a":"audio/mp4"};
export const HF_UPLOAD_TYPES = new Set(["image/jpeg","image/png","image/webp","image/gif","video/mp4","audio/wav"]);
export function normalizeContentType(type: string): string {
 const value = type.split(";")[0].trim().toLowerCase();
 return aliases[value] ?? value;
}
export function formatForType(type: string): MediaFormat {
 const format = formats[normalizeContentType(type)];
 if (!format) throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Use a JPEG, PNG, WebP, GIF, MP4, WebM, MOV, MP3, WAV, OGG, or M4A file.", 415);
 return format;
}
function containsFrame(bytes: Buffer): boolean {
 let offset=0;
 if(bytes.subarray(0,3).toString("ascii")==="ID3"){
  if(bytes.length<10 || [6,7,8,9].some(i=>bytes[i]>127))return false;
  offset=10+((bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9]);
 }
 for(let i=offset;i<Math.min(bytes.length-3,offset+4096);i++){
  if(bytes[i]===0xff && (bytes[i+1]&0xe0)===0xe0 && (bytes[i+1]&0x18)!==0x08 && (bytes[i+1]&6)!==0 && (bytes[i+2]>>4)>0 && (bytes[i+2]>>4)<15 && (bytes[i+2]&12)!==12)return true;
 }
 return false;
}
export function sniffMedia(bytes: Uint8Array, declaredType?: string): MediaFormat {
 const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let type="";
 if(b.length>=24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.readUInt32BE(8)===13 && b.subarray(12,16).toString("ascii")==="IHDR" && b.readUInt32BE(16)>0 && b.readUInt32BE(20)>0)type="image/png";
 else if(b.length>=4 && b[0]===255 && b[1]===216 && b[2]===255 && b[b.length-2]===255 && b[b.length-1]===217)type="image/jpeg";
 else if(b.length>=20 && b.subarray(0,4).toString("ascii")==="RIFF" && b.subarray(8,12).toString("ascii")==="WEBP" && ["VP8 ","VP8L","VP8X"].includes(b.subarray(12,16).toString("ascii")) && b.readUInt32LE(4)+8<=b.length)type="image/webp";
 else if(b.length>=13 && ["GIF87a","GIF89a"].includes(b.subarray(0,6).toString("ascii")) && b.readUInt16LE(6)>0 && b.readUInt16LE(8)>0)type="image/gif";
 else if(b.length>=16 && b.subarray(4,8).toString("ascii")==="ftyp" && b.readUInt32BE(0)>=16 && b.readUInt32BE(0)<=b.length){
  const brand=b.subarray(8,12).toString("ascii");
  type=brand.startsWith("M4A")||brand.startsWith("M4B")||normalizeContentType(declaredType??"")==="audio/mp4"?"audio/mp4":brand==="qt  "?"video/quicktime":"video/mp4";
 } else if(b.length>=16 && b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) && b.subarray(0,Math.min(4096,b.length)).includes(Buffer.from("webm")))type="video/webm";
 else if(b.length>=44 && b.subarray(0,4).toString("ascii")==="RIFF" && b.subarray(8,12).toString("ascii")==="WAVE" && b.includes(Buffer.from("fmt ")) && b.includes(Buffer.from("data")) && b.readUInt32LE(4)+8<=b.length)type="audio/wav";
 else if(b.length>=28 && b.subarray(0,4).toString("ascii")==="OggS" && (b.subarray(0,512).includes(Buffer.from("OpusHead"))||b.subarray(0,512).includes(Buffer.from("vorbis"))))type="audio/ogg";
 else if(b.length>=4 && containsFrame(b))type="audio/mpeg";
 if(!type)throw new AppError("INVALID_MEDIA_BYTES","The file is not a supported media format.",415);
 const format=formats[type];
 if(declaredType && normalizeContentType(declaredType)!=="application/octet-stream" && normalizeContentType(declaredType)!==type)throw new AppError("MEDIA_TYPE_MISMATCH","The file content does not match its media type.",415);
 if(b.length>MEDIA_LIMITS[format.kind])throw new AppError("MEDIA_TOO_LARGE",`The ${format.kind} file exceeds the ${MEDIA_LIMITS[format.kind]/1024/1024} MiB limit.`,413);
 return format;
}
export function assertIdentifier(id: string): string {
 if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw new AppError("INVALID_MEDIA_ID","Invalid media identifier.",400);
 return id;
}
export function assertMediaKey(key:string):string {
 if(!/^u\/[A-Za-z0-9_-]{1,200}\/(?:uploads\/[A-Za-z0-9_-]{1,200}|generations\/[A-Za-z0-9_-]{1,200}\/[0-9]{1,3})\.(?:jpg|png|webp|gif|mp4|mov|webm|mp3|wav|ogg|m4a|svg|zip|jsx|fbx|ply)$/.test(key))throw new AppError("INVALID_MEDIA_KEY","Invalid media path.",404);
 return key;
}
export function mediaUrl(key:string):string { return "/api/media/"+assertMediaKey(key).split("/").map(encodeURIComponent).join("/"); }
export function contentTypeForKey(key:string):string {
 assertMediaKey(key);
 const extension=key.slice(key.lastIndexOf(".")+1);
 if(extension==="svg")return "image/svg+xml";
 if(ARTIFACT_TYPES[extension])return ARTIFACT_TYPES[extension];
 const format=Object.values(formats).find(item=>item.extension===extension);
 if(!format)throw new AppError("INVALID_MEDIA_KEY","Invalid media path.",404);
 return format.contentType;
}
export function isPublicAddress(address:string):boolean {
 const version=isIP(address);
 if(version===4){
  const [a,b,c]=address.split(".").map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===192&&b===0)||(a===192&&b===88&&c===99)||(a===198&&(b===18||b===19))||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113));
 }
 if(version===6){
  const lower=address.toLowerCase();
  // Only global unicast is accepted. Parse hextets numerically so leading
  // zeroes cannot bypass the reserved-network checks.
  const halves=lower.split("::");
  const left=halves[0]?halves[0].split(":"):[];
  const right=halves[1]?halves[1].split(":"):[];
  const words=[...left,...Array(Math.max(0,8-left.length-right.length)).fill("0"),...right].map(word=>parseInt(word,16));
  if(words[0]<0x2000||words[0]>=0x4000)return false;
  if(words[0]===0x2001&&(words[1]<0x0200||words[1]===0x0db8))return false;
  if(words[0]===0x2002||words[0]===0x3fff)return false;
  return true;
 }
 return false;
}
export function parseMediaRange(range:string|undefined,size:number):{start:number;end:number}|undefined {
 if(!range)return undefined;
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);
 if(!match||(!match[1]&&!match[2])||size<=0)throw new AppError("INVALID_RANGE","The requested byte range is unavailable.",416);
 let start:number,end:number;
 if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw new AppError("INVALID_RANGE","The requested byte range is unavailable.",416);start=Math.max(0,size-suffix);end=size-1;}
 else{start=Number(match[1]);end=match[2]?Number(match[2]):size-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw new AppError("INVALID_RANGE","The requested byte range is unavailable.",416);
 return {start,end:Math.min(end,size-1)};
}

export function sanitizeMediaName(name:string):string {
 return name.replace(/[\u0000-\u001f\u007f/\\\u202a-\u202e\u2066-\u2069]/g,"").trim().slice(0,160)||"Untitled upload";
}
