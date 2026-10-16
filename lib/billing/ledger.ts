import {createHash} from "node:crypto";
import type {Transaction} from "../db/repository";
import type {Profile,Generation,LedgerEntry} from "../types";
import {AppError} from "../errors";
export async function changeCredits(tx:Transaction,user:Profile,delta:number,bucket:"subscription"|"topup",reason:string,refId:string,note?:string){
 if(!Number.isSafeInteger(delta))throw new AppError("INVALID_CREDITS","Credit amounts must be whole numbers.");
 const id=createHash("sha256").update(reason+":"+refId+":"+bucket).digest("hex");
 if(await tx.get("credit_ledger",id))return user;
 const key=bucket==="subscription"?"subscriptionCredits":"topupCredits";
 if(user[key]+delta<0)throw new AppError("INSUFFICIENT_CREDITS","You need more credits for this generation.",402);
 user={...user,[key]:user[key]+delta};
 const entry:LedgerEntry={id,userId:user.id,delta,bucket,reason,refId,balanceAfter:user.subscriptionCredits+user.topupCredits,createdAt:new Date().toISOString(),...(note?{note}:{})};
 await tx.insert("credit_ledger",entry);await tx.put("profiles",user);return user;
}
export async function debit(tx:Transaction,user:Profile,cost:number,generationId:string){
 if(!Number.isSafeInteger(cost)||cost<1)throw new AppError("INVALID_PRICE","A verified price is required.",503);
 if(user.subscriptionCredits+user.topupCredits<cost)throw new AppError("INSUFFICIENT_CREDITS","You need more credits for this generation.",402);
 const subscription=Math.min(user.subscriptionCredits,cost),topup=cost-subscription;
 if(subscription)user=await changeCredits(tx,user,-subscription,"subscription","generation_debit",generationId);
 if(topup)user=await changeCredits(tx,user,-topup,"topup","generation_debit",generationId);
 return {user,allocation:{subscription,topup}};
}
export async function refund(tx:Transaction,g:Generation){
 let user=await tx.get("profiles",g.userId);if(!user)throw new Error("Generation owner unavailable");
 if(g.debit.subscription)user=await changeCredits(tx,user,g.debit.subscription,"subscription","generation_refund",g.id);
 if(g.debit.topup)user=await changeCredits(tx,user,g.debit.topup,"topup","generation_refund",g.id);
 return user;
}
