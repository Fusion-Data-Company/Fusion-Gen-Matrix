import "server-only";
import sharp from "sharp";
import {Input,BufferSource,ALL_FORMATS} from "mediabunny";
import {AppError} from "../errors";
import type {Surface} from "../types";
export interface MediaMetadata {width?:number;height?:number;durationSec?:number}
/** Read dimensions and timing from retained bytes, never browser-supplied metadata. */
export async function inspectMedia(bytes:Uint8Array,kind:Surface):Promise<MediaMetadata>{
 let input:Input|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const probe=async()=>{
  if(kind==="image"){
   const metadata=await sharp(bytes,{limitInputPixels:100_000_000}).metadata();
   const width=metadata.autoOrient.width,height=metadata.autoOrient.height;
   if(!width||!height)throw new Error("Missing image dimensions");
   return {width,height};
  }
  input=new Input({source:new BufferSource(bytes),formats:ALL_FORMATS});
  const track=kind==="video"?await input.getPrimaryVideoTrack():await input.getPrimaryAudioTrack();
  if(!track)throw new Error("Missing expected media track");
  const durationSec=await track.computeDuration({skipLiveWait:true});
  if(!Number.isFinite(durationSec)||durationSec<=0)throw new Error("Invalid duration");
  if(track.isVideoTrack()){
   const width=await track.getDisplayWidth(),height=await track.getDisplayHeight();
   if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>100_000_000)throw new Error("Invalid dimensions");
   return {width,height,durationSec};
  }
  return {durationSec};
 };
 try{return await Promise.race([probe(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Media inspection timed out")),5000);})]);}
 catch{throw new AppError("INVALID_MEDIA_METADATA","This file's dimensions or duration could not be read. Export a valid media file and try again.",415);}
 finally{if(timer)clearTimeout(timer);input?.dispose();}
}
