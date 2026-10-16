import {api} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {assertSameOrigin,rateLimit} from "@/lib/auth/security";
import {repository} from "@/lib/db/repository";
import {saveUpload} from "@/lib/storage";
import {publicUpload} from "@/lib/serialize";
import {AppError} from "@/lib/errors";
export const maxDuration=60;
export async function GET(request:Request){return api(async()=>{const user=await requireUser(request);return {items:(await repository().read(tx=>tx.find("uploads",{userId:user.id},500))).filter(u=>u.status!=="pending").map(publicUpload)};});}
export async function POST(request:Request){return api(async()=>{
 assertSameOrigin(request);const user=await requireUser(request);await rateLimit("upload",user.id,20,60);
 const length=Number(request.headers.get("content-length")??0);if(!length||length>210*1024*1024)throw new AppError("UPLOAD_SIZE","Choose a file smaller than 200 MiB.",413);
 const data=await request.formData(),file=data.get("file");if(!(file instanceof File))throw new AppError("MISSING_FILE","Choose a file to upload.");
 const upload=await saveUpload(user.id,file);await repository().transaction(tx=>tx.insert("uploads",upload));return {upload:publicUpload(upload)};
});}
