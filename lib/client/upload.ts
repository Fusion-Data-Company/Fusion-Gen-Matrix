"use client";
import type {Upload} from "@/lib/types";
import {api,post,ApiError} from "./api";
export class UploadCompletionError extends Error {
 constructor(public uploadId:string,public fileName:string) {super("The file reached storage, but saving its library record did not finish. Retry saving without uploading it again.");this.name="UploadCompletionError";}
}
export async function completeReferenceUpload(uploadId:string):Promise<Upload> {
 const result=await post<{upload:Upload}>("/api/uploads/direct",{stage:"complete",uploadId});
 return result.upload;
}
export async function uploadReference(file:File,mode:"demo"|"live"|"showcase",onProgress?:(status:string)=>void):Promise<Upload> {
 if(mode==="showcase")throw new Error("Uploads are unavailable in the public showcase.");
 const type=file.type.toLowerCase();const imageTypes=["image/jpeg","image/jpg","image/png","image/webp","image/gif"];const audioTypes=["audio/wav","audio/x-wav"];const limit=imageTypes.includes(type)?20:type==="video/mp4"?200:audioTypes.includes(type)?50:0;
 if(!limit)throw new Error("Choose a JPEG, PNG, WebP, GIF, MP4 or WAV file.");
 if(file.size>limit*1024*1024)throw new Error("This file type allows up to "+limit+" MiB.");
 if(mode==="demo"){onProgress?.("Saving reference…");const form=new FormData();form.set("file",file);return (await api<{upload:Upload}>("/api/uploads",{method:"POST",body:form})).upload;}
 onProgress?.("Preparing upload…");
 const prepared=await post<{uploadId:string;uploadUrl:string;headers:Record<string,string>;expiresAt:string}>("/api/uploads/direct",{stage:"prepare",name:file.name,contentType:file.type,bytes:file.size});
 onProgress?.("Uploading reference…");
 let response:Response;
 try{response=await fetch(prepared.uploadUrl,{method:"PUT",body:file,headers:prepared.headers,credentials:"omit",redirect:"error"});}catch{throw new Error("The storage upload could not finish. Check your connection and try again. If this persists, the storage CORS configuration may need review.");}
 if(!response.ok)throw new Error("Storage declined the upload (HTTP "+response.status+"). Please try again.");
 onProgress?.("Saving library record…");
 try{return await completeReferenceUpload(prepared.uploadId);}
 catch(error){if(error instanceof ApiError&&error.status<500&&error.status!==409)throw error;throw new UploadCompletionError(prepared.uploadId,file.name);}
}
