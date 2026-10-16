import { isIP } from "node:net";
import { AppError } from "./errors";

/** Shared by the provider upload contract and the browser CSP. */
export function configuredUploadOrigins(values:string[]=(process.env.HF_UPLOAD_ORIGINS??"").split(",").map(value=>value.trim()).filter(Boolean),allowEmpty=false):string[]{
 if(!values.length&&allowEmpty)return [];
 if(!values.length)throw new AppError("DIRECT_UPLOAD_NOT_CONFIGURED","Direct upload is not configured. Add the verified provider storage origins to HF_UPLOAD_ORIGINS and the studio's connect-src policy.",503);
 if(values.length>16)throw new AppError("INVALID_UPLOAD_ORIGINS","Configure no more than 16 exact HTTPS upload origins.",503);
 return [...new Set(values.map(value=>{
  let url:URL;try{url=new URL(value);}catch{throw new AppError("INVALID_UPLOAD_ORIGINS","HF_UPLOAD_ORIGINS must contain exact HTTPS origins without wildcards, credentials, paths, or query strings.",503);}
  if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/"||url.hostname.includes("*")||!url.hostname.includes(".")||isIP(url.hostname.replace(/^\[|\]$/g,""))||(url.port&&url.port!=="443")||url.hostname.endsWith(".")||/\.(localhost|local|internal|test|invalid|onion)$/.test(url.hostname))throw new AppError("INVALID_UPLOAD_ORIGINS","HF_UPLOAD_ORIGINS must contain exact public HTTPS origins without wildcards, credentials, paths, or query strings.",503);
  return url.origin;
 }))];
}
