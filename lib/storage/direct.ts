import "server-only";
import { randomUUID } from "node:crypto";
import type { Repository } from "../db/repository";
import { AppError } from "../errors";
import type { Upload } from "../types";
import { assertIdentifier } from "./validation";
import type { DirectMediaAdapter, DirectUploadInput, PendingDirectUpload, ReadyDirectUpload } from "./direct-contract";

interface DirectRecord extends Upload { finalizingUntil?:string;finalizingToken?:string }
export class DirectUploadCoordinator {
 constructor(private readonly repo:Repository,private readonly media:DirectMediaAdapter,private readonly now:()=>Date=()=>new Date()){}
 async prepare(userId:string,input:DirectUploadInput){
  assertIdentifier(userId);
  const prepared=await this.media.prepareDirectUpload(userId,input);
  await this.repo.transaction(tx=>tx.insert("uploads",prepared.upload));
  return prepared.instructions;
 }
 async complete(userId:string,uploadId:string):Promise<ReadyDirectUpload>{
  assertIdentifier(userId);assertIdentifier(uploadId);
  const token=randomUUID(),now=this.now();
  const claim=await this.repo.transaction(async tx=>{
   const upload=await tx.get("uploads",uploadId) as DirectRecord|null;
   if(!upload||upload.userId!==userId)throw new AppError("NOT_FOUND","This upload is unavailable.",404);
   if(upload.status==="ready"){
    if(!upload.r2Key||!upload.url)throw new AppError("INVALID_UPLOAD_STATE","The saved upload is incomplete.",503);
    return {ready:upload as ReadyDirectUpload,pending:null};
   }
   if(upload.status!=="pending"||!upload.providerUrl||!upload.r2Key||!upload.expiresAt)throw new AppError("INVALID_UPLOAD_STATE","This upload cannot be completed.",409);
   if(!Number.isFinite(Date.parse(upload.expiresAt))||Date.parse(upload.expiresAt)<=now.getTime())throw new AppError("UPLOAD_EXPIRED","This upload expired. Select the file again to start a new upload.",410);
   if(upload.finalizingUntil&&Date.parse(upload.finalizingUntil)>now.getTime())throw new AppError("UPLOAD_FINALIZING","This upload is being saved. Retry completion shortly.",409);
   const claimed={...upload,finalizingToken:token,finalizingUntil:new Date(now.getTime()+300000).toISOString()};
   await tx.put("uploads",claimed);
   return {ready:null,pending:claimed as PendingDirectUpload};
  });
  if(claim.ready)return claim.ready;
  try{
   const completed=await this.media.completeDirectUpload(claim.pending!);
   return await this.repo.transaction(async tx=>{
    const current=await tx.get("uploads",uploadId) as DirectRecord|null;
    if(!current||current.userId!==userId)throw new AppError("NOT_FOUND","This upload is unavailable.",404);
    if(current.status==="ready")return current as ReadyDirectUpload;
    if(current.finalizingToken!==token)throw new AppError("UPLOAD_FINALIZING","Another request is saving this upload. Retry completion shortly.",409);
    await tx.put("uploads",completed);return completed;
   });
  }catch(error){
   await this.repo.transaction(async tx=>{
    const current=await tx.get("uploads",uploadId) as DirectRecord|null;
    if(current?.userId===userId&&current.status==="pending"&&current.finalizingToken===token){
     const {finalizingToken,finalizingUntil,...pending}=current;void finalizingToken;void finalizingUntil;
     await tx.put("uploads",pending);
    }
   }).catch(()=>{});
   throw error;
  }
 }
}
