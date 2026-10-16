"use client";
import {create} from "zustand";
import type {Surface, Settings, Media} from "@/lib/types";
export interface Draft {modelId:string;prompt:string;settings:Settings;media:Media[];projectId?:string;presetId?:string}
const blank=():Draft=>({modelId:"",prompt:"",settings:{},media:[]});
interface DockStore {drafts:Record<Surface,Draft>;update:(surface:Surface,patch:Partial<Draft>)=>void;reset:(surface:Surface)=>void;}
export const useDock=create<DockStore>((set)=>({
  drafts:{image:blank(),video:blank(),audio:blank()},
  update:(surface,patch)=>set(state=>({drafts:{...state.drafts,[surface]:{...state.drafts[surface],...patch}}})),
  reset:(surface)=>set(state=>({drafts:{...state.drafts,[surface]:blank()}}))
}));
