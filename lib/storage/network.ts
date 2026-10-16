import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { AppError } from "../errors";
import { isPublicAddress } from "./validation";

export interface SafeResponse { bytes:Buffer; contentType:string; status:number }
export type Resolver = (hostname:string)=>Promise<Array<{address:string;family:number}>>;
const defaultResolver:Resolver=(hostname)=>dnsLookup(hostname,{all:true,verbatim:true});
export async function resolvePublicHttps(value:string,resolver:Resolver=defaultResolver):Promise<{url:URL;address:string;family:4|6}> {
 let url:URL;
 try{url=new URL(value);}catch{throw new AppError("UNSAFE_MEDIA_URL","The provider returned an invalid media URL.",502);}
 const hostname=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
 if(url.protocol!=="https:"||url.username||url.password||url.hash||(url.port&&url.port!=="443")||isIP(hostname)||!hostname.includes(".")||hostname.endsWith(".")||/\.(localhost|local|internal|test|invalid|onion)$/.test(hostname))throw new AppError("UNSAFE_MEDIA_URL","The provider returned an unsupported media URL.",502);
 const allowlist=(process.env.HF_MEDIA_ALLOWED_HOSTS??"").split(",").map(item=>item.trim().toLowerCase()).filter(Boolean);
 if(allowlist.length&&!allowlist.includes(hostname))throw new AppError("MEDIA_HOST_NOT_ALLOWED","The provider media host is not in the configured allowlist.",502);
 let records:Array<{address:string;family:number}>;
 let dnsTimer:ReturnType<typeof setTimeout>|undefined;
 try{
  records=await Promise.race([resolver(hostname),new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(new Error("DNS timeout")),5000);dnsTimer.unref();})]);
 }catch{throw new AppError("MEDIA_DNS_FAILED","The provider media host could not be resolved.",502);}
 finally{if(dnsTimer)clearTimeout(dnsTimer);}
 if(!records.length||records.some(item=>!isPublicAddress(item.address)||(item.family!==4&&item.family!==6)))throw new AppError("UNSAFE_MEDIA_ADDRESS","The provider media host does not resolve to a permitted public address.",502);
 const chosen=records.find(item=>item.family===4)??records[0];
 return {url,address:chosen.address,family:chosen.family as 4|6};
}
export function safeUploadHeaders(source:Record<string,string>,contentType?:string,forBrowser=false):Record<string,string>{
 const headers:Record<string,string>={};const seen=new Set<string>();
 for(const [name,value] of Object.entries(source)){
  const lower=name.toLowerCase();
  if(!/^[!#$%&'*+.^_\x60|~0-9a-z-]+$/i.test(name)||/[\r\n]/.test(value)||seen.has(lower)||["authorization","cookie","proxy-authorization","host","connection","transfer-encoding","content-length","upgrade"].includes(lower)||
   (forBrowser&&(/^(sec-|proxy-)/.test(lower)||["accept-charset","accept-encoding","access-control-request-headers","access-control-request-method","cookie2","date","dnt","expect","keep-alive","origin","referer","set-cookie","te","trailer","user-agent","via"].includes(lower))))throw new AppError("UNSAFE_UPLOAD_HEADERS","The provider returned unsupported upload headers.",502);
  seen.add(lower);headers[name]=value;
 }
 if(contentType){
  const declared=Object.entries(headers).find(([name])=>name.toLowerCase()==="content-type")?.[1];
  if(declared?.split(";")[0].trim().toLowerCase()!==contentType)throw new AppError("UNSAFE_UPLOAD_HEADERS","The provider did not return matching upload Content-Type instructions.",502);
 }
 return headers;
}
/** DNS is checked once, then the HTTPS socket is pinned to that exact address.
 * TLS SNI and certificate checks still use the original host. Redirects are rejected.
 * This function never sends cookies or the Higgsfield API credentials. */
export async function safeMediaRequest(value:string,options:{method?:"GET"|"PUT";body?:Uint8Array;headers?:Record<string,string>;maxBytes:number;timeoutMs?:number}):Promise<SafeResponse> {
 const resolved=await resolvePublicHttps(value);
 const headers=safeUploadHeaders(options.headers??{});
 if(options.body)headers["Content-Length"]=String(options.body.byteLength);
 const timeout=Math.min(120000,Math.max(1000,options.timeoutMs??60000));
 return await new Promise<SafeResponse>((resolve,reject)=>{
  let finished=false;
  const fail=(error:Error)=>{if(finished)return;finished=true;clearTimeout(timer);reject(error);};
  const req=httpsRequest(resolved.url,{
   method:options.method??"GET",headers,agent:false,
   servername:resolved.url.hostname,
   lookup:(_hostname,lookupOptions,callback)=>{
    if(typeof lookupOptions==="object"&&lookupOptions.all)callback(null,[{address:resolved.address,family:resolved.family}]);
    else callback(null,resolved.address,resolved.family);
   }
  },response=>{
   const status=response.statusCode??0;
   if(status<200||status>=300){response.destroy();fail(new AppError(status>=300&&status<400?"MEDIA_REDIRECT_REJECTED":"MEDIA_TRANSFER_FAILED","The media host did not return a successful direct response.",502));return;}
   const declared=Number(response.headers["content-length"]);
   if(Number.isFinite(declared)&&declared>options.maxBytes){response.destroy();fail(new AppError("MEDIA_TOO_LARGE","The media transfer exceeds its size limit.",413));return;}
   const chunks:Buffer[]=[];let received=0;
   response.on("data",(chunk:Buffer)=>{
    received+=chunk.length;
    if(received>options.maxBytes){response.destroy();fail(new AppError("MEDIA_TOO_LARGE","The media transfer exceeds its size limit.",413));return;}
    chunks.push(chunk);
   });
   response.on("error",()=>fail(new AppError("MEDIA_TRANSFER_FAILED","The media transfer was interrupted.",502)));
   response.on("end",()=>{
    if(finished)return;
    finished=true;clearTimeout(timer);
    resolve({bytes:Buffer.concat(chunks,received),contentType:String(response.headers["content-type"]??"application/octet-stream").split(";")[0],status});
   });
  });
  const timer=setTimeout(()=>{req.destroy();fail(new AppError("MEDIA_TRANSFER_TIMEOUT","The media transfer timed out.",504));},timeout);
  timer.unref();
  req.on("error",()=>fail(new AppError("MEDIA_TRANSFER_FAILED","The media transfer was interrupted.",502)));
  if(options.body)req.end(options.body);else req.end();
 });
}
