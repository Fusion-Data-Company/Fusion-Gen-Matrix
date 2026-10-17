"use client";
import Link from "next/link";
import {ArrowUpRight,ImagePlus,SlidersHorizontal,Sparkles} from "lucide-react";
import {ConceptArt,ConceptLabel} from "./concept-art";
import type {Surface} from "@/lib/types";

export function StudioHelp({surface,onModel,onPrompt,onSettings}:{surface:Surface;onModel:()=>void;onPrompt:()=>void;onSettings:()=>void}){
 const steps=[{title:"SET THE SCENE",text:"Describe a subject or add a compatible reference.",scene:0,action:"Write a prompt",onClick:onPrompt,Icon:ImagePlus},{title:"CHOOSE YOUR DIRECTION",text:"Pick a model and shape the format, quality and motion.",scene:1,action:"Choose a model",onClick:onModel,Icon:SlidersHorizontal},{title:"KEEP THE PROCESS",text:"Your finished work keeps its prompt and settings.",scene:3,action:"Review settings",onClick:onSettings,Icon:Sparkles}];
 return <div className="studio-guide"><span className="eyebrow">YOUR CREATIVE WORKFLOW</span><h2>{surface==="video"?"MAKE YOUR NEXT SCENE":"MAKE YOUR NEXT FRAME"}</h2><p>A brief, a model and a creative direction. Everything else stays with the work.</p><div className="guide-steps">{steps.map(({title,text,scene,action,onClick,Icon},index)=><div className="guide-step" key={title}><button className="guide-visual" onClick={onClick} aria-label={action}><ConceptArt scene={scene}/><span className="guide-step-number">0{index+1}</span><ConceptLabel/><span className="guide-hover"><Icon size={22}/>{action}</span></button><h3>{title}</h3><p>{text}</p></div>)}</div><Link className="guide-effects" href="/effects"><span><strong>Need a starting point?</strong> Explore reusable creative effects.</span><ArrowUpRight size={18}/></Link></div>;
}
