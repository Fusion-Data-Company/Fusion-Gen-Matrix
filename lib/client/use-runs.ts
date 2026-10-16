"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {Generation} from "@/lib/types";
import {api,isActive,messageOf} from "./api";
export function useRuns(query:string,userId:string|undefined) {
 const [items,setItems]=useState<Generation[]>([]),[owner,setOwner]=useState<string|undefined>(undefined),[loading,setLoading]=useState(!!userId),[error,setError]=useState("");
 const itemsRef=useRef(items);
 useEffect(()=>{itemsRef.current=owner===userId?items:[];},[items,owner,userId]);
 const reload=useCallback(async()=>{if(!userId)return;try{const result=await api<{items:Generation[]}>("/api/generations"+query);setItems(result.items);setOwner(userId);setError("");}catch(e){setError(messageOf(e));}finally{setLoading(false);}},[query,userId]);
 useEffect(()=>{if(!userId)return;let active=true;void api<{items:Generation[]}>("/api/generations"+query).then(result=>{if(active){setItems(result.items);setOwner(userId);setError("");}}).catch(e=>{if(active)setError(messageOf(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[query,userId]);
 useEffect(()=>{if(!userId)return;const timer=setInterval(async()=>{const active=itemsRef.current.filter(item=>isActive(item.status));if(!active.length)return;try{const result=await api<{items:Generation[]}>("/api/generations/status?ids="+active.map(item=>encodeURIComponent(item.id)).join(","));setItems(current=>current.map(item=>({...item,...result.items.find(updated=>updated.id===item.id)})));}catch(e){setError(messageOf(e));}},3500);return()=>clearInterval(timer);},[userId]);
 const add=useCallback((generation:Generation)=>{setOwner(userId);setItems(current=>[generation,...current.filter(item=>item.id!==generation.id)]);},[userId]);
 return {items:owner===userId&&userId?items:[],loading:!!userId&&loading,error,reload,add};
}
