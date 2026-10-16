import type {Preset} from "../types";
import {getModel} from "../catalog";
const imageModel="alibaba/qwen-image-3/text-to-image";
const videoModel="bytedance/seedance-2.5/text-to-video";
function preset(slug:string,title:string,description:string,surface:"image"|"video",template:string,category:string,cover:string):Preset{
 const modelId=surface==="image"?imageModel:videoModel;
 return {id:slug,slug,title,description,surface,modelId,promptTemplate:template,settings:{...getModel(modelId)!.defaultSettings},category,coverUrl:"/art/"+cover+".svg",active:true};
}
export const starterPresets:Preset[]=[
 preset("product-light","Product light","Shape a product with soft directional light.","image","Studio product photograph of {prompt}. Soft directional light, tactile materials, restrained composition, room for a headline.","Commerce","still-life"),
 preset("architectural-form","Architectural form","Find structure, space, and material.","image","Architectural study of {prompt}. Precise lines, natural materials, afternoon light, editorial photography.","Brand","architecture"),
 preset("editorial-cover","Editorial cover","An uncluttered visual for the next story.","image","Editorial cover image for {prompt}. One strong subject, thoughtful negative space, a warm neutral palette. No typography.","Editorial","still-life"),
 preset("slow-orbit","Slow orbit","Give one subject a cinematic point of view.","video","A slow cinematic orbit around {prompt}. Smooth camera movement, stable subject, natural light, carefully composed opening and closing frames.","Motion","motion-study"),
 preset("campaign-moment","Campaign moment","Turn a brief into a short brand scene.","video","A short campaign scene featuring {prompt}. Clear visual story, intentional movement, tactile details, no on-screen text.","Campaign","motion-study")
];
