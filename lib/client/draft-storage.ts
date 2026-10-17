import type {Surface,Settings,Media} from "../types";
export interface Draft {modelId:string;prompt:string;settings:Settings;media:Media[];projectId?:string;presetId?:string}
export interface DraftSnapshot {drafts:Record<Surface,Draft>;ownerId:string|null;updatedAt:number}
export const DRAFT_TTL=24*60*60*1000;
export const blankDraft=():Draft=>({modelId:"",prompt:"",settings:{},media:[]});
export const blankSnapshot=():DraftSnapshot=>({drafts:{image:blankDraft(),video:blankDraft(),audio:blankDraft()},ownerId:null,updatedAt:0});
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
export function restoreDrafts(value:unknown,now=Date.now()):DraftSnapshot {
 const empty=blankSnapshot();
 if(!object(value)||typeof value.updatedAt!=="number"||value.updatedAt>now||now-value.updatedAt>DRAFT_TTL||!object(value.drafts))return empty;
 for(const surface of ["image","video","audio"] as const){
  const draft=value.drafts[surface];if(!object(draft))continue;
  const settings:Settings={};
  if(object(draft.settings))for(const [key,entry] of Object.entries(draft.settings).slice(0,100))if(!["__proto__","constructor","prototype"].includes(key)&&(typeof entry==="boolean"||typeof entry==="number"&&Number.isFinite(entry)||typeof entry==="string"&&entry.length<=30000))settings[key]=entry;
  const media:Media[]=Array.isArray(draft.media)?draft.media.filter((item):item is Media=>object(item)&&typeof item.id==="string"&&(item.outputIndex===undefined||typeof item.outputIndex==="number"&&Number.isInteger(item.outputIndex)&&item.outputIndex>=0&&item.outputIndex<100)&&typeof item.url==="string"&&item.url.startsWith("/api/media/u/")&&["image","video","audio"].includes(String(item.kind))&&["start","end","reference","video","audio","source"].includes(String(item.role))).slice(0,50):[];
  empty.drafts[surface]={modelId:typeof draft.modelId==="string"?draft.modelId.slice(0,200):"",prompt:typeof draft.prompt==="string"?draft.prompt.slice(0,30000):"",settings,media,...(typeof draft.projectId==="string"?{projectId:draft.projectId.slice(0,200)}:{}),...(typeof draft.presetId==="string"?{presetId:draft.presetId.slice(0,200)}:{})};
 }
 return {...empty,ownerId:typeof value.ownerId==="string"?value.ownerId:null,updatedAt:value.updatedAt};
}
export function claimDrafts(snapshot:DraftSnapshot,ownerId:string|null):DraftSnapshot {
 return snapshot.ownerId!==null&&snapshot.ownerId!==ownerId?{...blankSnapshot(),ownerId}:{...snapshot,ownerId};
}
