import "server-only";
import {AppError} from "../errors";
export const ARTIFACT_LIMIT=50*1024*1024;
export const ARTIFACT_TYPES:Readonly<Record<string,string>>={zip:"application/zip",jsx:"application/octet-stream",fbx:"application/octet-stream",ply:"application/octet-stream"};
/** Provider-native files remain opaque downloads. Never evaluate or unpack them. */
export function inspectArtifact(bytes:Uint8Array,name?:string){
 const extension=name?.toLowerCase();
 if(!extension||!ARTIFACT_TYPES[extension])throw new AppError("UNSUPPORTED_PROVIDER_ARTIFACT","The provider returned an unsupported artifact format.",502);
 if(!bytes.length||bytes.length>ARTIFACT_LIMIT)throw new AppError("INVALID_PROVIDER_ARTIFACT","The provider artifact is empty or exceeds 50 MiB.",502);
 const head=Buffer.from(bytes.subarray(0,512));let valid=false;
 if(extension==="zip")valid=head.length>=4&&head[0]===80&&head[1]===75&&((head[2]===3&&head[3]===4)||(head[2]===5&&head[3]===6)||(head[2]===7&&head[3]===8));
 if(extension==="fbx")valid=head.toString("ascii").startsWith("Kaydara FBX Binary")||/^;\s*FBX\s+\d/i.test(head.toString("utf8"));
 if(extension==="ply")valid=/^ply\r?\nformat (ascii|binary_little_endian|binary_big_endian) 1\.0\r?\n/.test(head.toString("utf8"));
 if(extension==="jsx")try{const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);valid=!!text.trim()&&!text.includes("\u0000")&&!/^\s*(?:<!doctype|<html)/i.test(text);}catch{/* Invalid text is rejected. */}
 if(!valid)throw new AppError("INVALID_PROVIDER_ARTIFACT","The provider artifact does not match its declared format.",502);
 return {kind:"artifact" as const,extension,contentType:ARTIFACT_TYPES[extension]};
}
export function artifactDisposition(key:string):string{
 const extension=key.slice(key.lastIndexOf(".")+1);
 return ARTIFACT_TYPES[extension]?`attachment; filename="fusion-${key.split("/").at(-2)}-${key.split("/").at(-1)}"`:"inline";
}
