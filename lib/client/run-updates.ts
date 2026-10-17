import type {Generation} from "../types";
import {isActive} from "./api";
/** A delayed poll must never replace a newer result or resurrect a terminal job. */
export function newerRun(current:Generation|undefined,incoming:Generation):Generation {
 if(!current)return incoming;
 if(!isActive(current.status)&&isActive(incoming.status))return current;
 return Date.parse(current.updatedAt)>Date.parse(incoming.updatedAt)?current:incoming;
}
export function mergeRunUpdates(current:Generation[],updates:Generation[],replace=false):Generation[]{
 const previous=new Map(current.map(item=>[item.id,item])),incoming=new Map(updates.map(item=>[item.id,item]));
 return replace?updates.map(item=>newerRun(previous.get(item.id),item)):current.map(item=>incoming.has(item.id)?newerRun(item,incoming.get(item.id)!):item);
}
export function activeBatches(items:Generation[],size=50):string[][]{
 const ids=items.filter(item=>isActive(item.status)).map(item=>item.id),batches:string[][]=[];
 for(let index=0;index<ids.length;index+=size)batches.push(ids.slice(index,index+size));
 return batches;
}
