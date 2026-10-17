"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Generation} from "@/lib/types";
import {api,messageOf} from "./api";
import {activeBatches,mergeRunUpdates} from "./run-updates";
export function useRuns(query:string,userId:string|undefined) {
 const key=(userId??"")+query;
 const [state,setState]=useState<{key:string;items:Generation[];loading:boolean;error:string}>({key,items:[],loading:!!userId,error:""});
 const itemsRef=useRef<Generation[]>([]),scope=useRef(0);
 useEffect(()=>{itemsRef.current=state.key===key?state.items:[];},[state,key]);
 const reload=useCallback(async()=>{
  if(!userId)return;const epoch=scope.current;
  try{const result=await api<{items:Generation[]}>("/api/generations"+query);if(epoch===scope.current)setState(current=>({key,items:mergeRunUpdates(current.key===key?current.items:[],result.items,true),loading:false,error:""}));}
  catch(error){if(epoch===scope.current)setState(current=>({key,items:current.key===key?current.items:[],loading:false,error:messageOf(error)}));}
 },[key,query,userId]);
 useEffect(()=>{
  const epoch=++scope.current,controller=new AbortController();
  if(userId)void api<{items:Generation[]}>("/api/generations"+query,{signal:controller.signal}).then(result=>{if(epoch===scope.current)setState(current=>({key,items:mergeRunUpdates(current.key===key?current.items:[],result.items,true),loading:false,error:""}));}).catch(error=>{if(!controller.signal.aborted&&epoch===scope.current)setState(current=>({key,items:current.key===key?current.items:[],loading:false,error:messageOf(error)}));});
  return()=>{scope.current=epoch+1;controller.abort();};
 },[key,query,userId]);
 useEffect(()=>{
  if(!userId)return;const epoch=scope.current,controller=new AbortController();let pending=false;
  const poll=async()=>{
   if(pending||document.visibilityState==="hidden")return;
   const batches=activeBatches(itemsRef.current);if(!batches.length)return;pending=true;
   try{
    const updates:Generation[]=[];
    for(const batch of batches){const result=await api<{items:Generation[]}>("/api/generations/status?ids="+batch.map(encodeURIComponent).join(","),{signal:controller.signal});updates.push(...result.items);}
    if(epoch===scope.current)setState(current=>current.key===key?{...current,items:mergeRunUpdates(current.items,updates),error:""}:current);
   }catch(error){if(!controller.signal.aborted&&epoch===scope.current)setState(current=>({...current,error:messageOf(error)}));}finally{pending=false;}
  };
  const timer=setInterval(()=>void poll(),3500),resume=()=>{if(document.visibilityState==="visible")void poll();};
  document.addEventListener("visibilitychange",resume);
  return()=>{clearInterval(timer);controller.abort();document.removeEventListener("visibilitychange",resume);};
 },[key,userId]);
 const add=useCallback((generation:Generation)=>setState(current=>({key,items:[generation,...(current.key===key?current.items:[]).filter(item=>item.id!==generation.id)],loading:false,error:""})),[key]);
 return {items:state.key===key&&userId?state.items:[],loading:!!userId&&(state.key!==key||state.loading),error:state.key===key?state.error:"",reload,add};
}
