import {NextResponse} from "next/server";
import {z} from "zod";
import {AppError} from "./errors";
import {CatalogValidationError} from "./catalog/server";
import {HiggsfieldError} from "./higgsfield/client";
export async function body<T>(request:Request,schema:z.ZodType<T>):Promise<T>{
 const length=Number(request.headers.get("content-length")??0);
 if(length>100000)throw new AppError("BODY_TOO_LARGE","Request is too large.",413);
 const text=await request.text();if(text.length>100000)throw new AppError("BODY_TOO_LARGE","Request is too large.",413);
 let value:unknown;try{value=JSON.parse(text);}catch{throw new AppError("INVALID_JSON","Send a valid JSON request.");}
 const parsed=schema.safeParse(value);if(!parsed.success)throw new AppError("INVALID_INPUT",parsed.error.issues[0]?.message??"Check your input.");
 return parsed.data;
}
export function api(run:()=>Promise<unknown>){return run().then(value=>value instanceof Response?value:NextResponse.json(value,{headers:{"Cache-Control":"no-store"}})).catch(error=>{
 if(error instanceof AppError)return NextResponse.json({code:error.code,error:error.message},{status:error.status});
 if(error instanceof CatalogValidationError)return NextResponse.json({code:error.code,error:error.message},{status:400});
 if(error instanceof HiggsfieldError)return NextResponse.json({code:error.code,error:error.message},{status:error.status===429?429:503});
 return NextResponse.json({code:"INTERNAL_ERROR",error:"The studio could not complete this action. Please retry."},{status:500});
});}
export const idSchema=z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
