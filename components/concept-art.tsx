"use client";
import Image from "next/image";
import {useStudio} from "./studio-context";

const scenes = [
  "Original concept artwork: copper-haired portrait in warm studio light",
  "Original concept artwork: a traveler beneath a monumental volcanic arch",
  "Original concept artwork: a lime glass bottle on wet dark stone",
  "Original concept artwork: a silver coupe in a rain-lit city",
];

/** An original generated contact sheet, never a claimed result of a studio model. */
export function ConceptArt({scene=0,className="",priority=false}:{scene?:number;className?:string;priority?:boolean}) {
 const {data}=useStudio();
 const index=((scene%4)+4)%4;
 return <span className={"concept-art "+className}>
  <Image src="/art/fusion-concepts-v2.png" alt={scenes[index]} unoptimized={data?.mode==="demo"} fill priority={priority} sizes="(max-width: 760px) 200vw, 1100px" style={{width:"200%",height:"200%",maxWidth:"none",left:index%2?"-100%":"0",top:index>=2?"-100%":"0",objectFit:"cover"}}/>
 </span>;
}
export function ConceptLabel(){return <span className="concept-label">Concept artwork</span>;}
