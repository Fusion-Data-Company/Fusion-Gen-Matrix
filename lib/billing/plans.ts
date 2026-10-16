import type {Plan,Profile} from "../types";
export const plans:Plan[]=[
 {id:"free",name:"Free",credits:0,monthlyUsd:null,annualUsd:null,concurrent:1,description:"Explore the studio. No recurring charge.",configured:false},
 {id:"starter",name:"Starter",credits:1000,monthlyUsd:null,annualUsd:null,concurrent:2,description:"A focused creative workflow.",configured:false},
 {id:"plus",name:"Plus",credits:3500,monthlyUsd:null,annualUsd:null,concurrent:4,description:"More room for iteration and client work.",configured:false},
 {id:"ultra",name:"Ultra",credits:10000,monthlyUsd:null,annualUsd:null,concurrent:8,description:"Production volume with clear usage limits.",configured:false}
];
export const packs={small:500,medium:1500,large:5000};
export function getPlan(id:Profile["plan"]){return plans.find(p=>p.id===id)??plans[0];}
export function stripePrice(planId:string,interval:"monthly"|"annual"){return process.env["STRIPE_PRICE_"+planId.toUpperCase()+"_"+interval.toUpperCase()]??"";}
