"use client";
import {create} from "zustand";
import {createJSONStorage,persist} from "zustand/middleware";
import type {Surface} from "@/lib/types";
import {blankDraft,blankSnapshot,claimDrafts,restoreDrafts,type Draft,type DraftSnapshot} from "./draft-storage";
export type {Draft} from "./draft-storage";
interface DockStore extends DraftSnapshot {update:(surface:Surface,patch:Partial<Draft>)=>void;reset:(surface:Surface)=>void;claim:(ownerId:string|null)=>void;clear:()=>void;}
export const useDock=create<DockStore>()(persist((set,get)=>({
 ...blankSnapshot(),
 update:(surface,patch)=>set(state=>({updatedAt:Date.now(),drafts:{...state.drafts,[surface]:{...state.drafts[surface],...patch}}})),
 reset:(surface)=>set(state=>({updatedAt:Date.now(),drafts:{...state.drafts,[surface]:blankDraft()}})),
 claim:ownerId=>{
  const current=get();
  try{
   const stored=restoreDrafts(JSON.parse(localStorage.getItem("fusion-studio-drafts-v1")??"null")?.state);
   if(stored.ownerId===ownerId&&(current.ownerId!==ownerId||stored.updatedAt>current.updatedAt)){set(stored);return;}
  }catch{/* Unavailable or invalid device storage does not block sign-in. */}
  if(current.ownerId!==ownerId)set(claimDrafts(current,ownerId));
 },
 clear:()=>set(blankSnapshot())
}),{
 name:"fusion-studio-drafts-v1",version:1,skipHydration:true,
 storage:createJSONStorage(()=>({
  getItem:key=>{try{return localStorage.getItem(key);}catch{return null;}},
  setItem:(key,value)=>{try{localStorage.setItem(key,value);}catch{/* The studio stays usable when device storage is unavailable. */}},
  removeItem:key=>{try{localStorage.removeItem(key);}catch{/* Nothing to remove. */}}
 })),
 partialize:state=>({drafts:state.drafts,ownerId:state.ownerId,updatedAt:state.updatedAt}),
 merge:(persisted,current)=>({...current,...restoreDrafts(persisted)})
}));
