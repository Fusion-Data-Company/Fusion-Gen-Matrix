import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import type {ClientSession,Collection,Document,Filter} from "mongodb";
import {mongoClient} from "./mongo";
import {postgresPool} from "./postgres";
import {PostgresRepository} from "./postgres-repository";
import {verifyPostgresSchema} from "./postgres-maintenance";
import {getEnv} from "../env";
import type {Profile,Generation,Project,Upload,LedgerEntry,EventRecord,Preset,PricingOverride,Report,RateLimit,PreviewSession} from "../types";
export interface Tables {profiles:Profile;generations:Generation;projects:Project;uploads:Upload;credit_ledger:LedgerEntry;stripe_events:EventRecord;hf_webhook_events:EventRecord;presets:Preset;model_pricing:PricingOverride;reports:Report;rate_limits:RateLimit;preview_sessions:PreviewSession}
export type Table=keyof Tables;
export type Query=Record<string,unknown>;
export interface Transaction{
 get<K extends Table>(table:K,id:string):Promise<Tables[K]|null>;
 find<K extends Table>(table:K,query?:Query,limit?:number,sort?:Record<string,1|-1>):Promise<Tables[K][]>;
 put<K extends Table>(table:K,value:Tables[K]):Promise<void>;
 insert<K extends Table>(table:K,value:Tables[K]):Promise<void>;
 remove(table:Table,id:string):Promise<void>;
}
export interface Repository {read<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>;transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>}
type State={ [K in Table]:Record<string,Tables[K]> };
const names:Table[]=["profiles","generations","projects","uploads","credit_ledger","stripe_events","hf_webhook_events","presets","model_pricing","reports","rate_limits","preview_sessions"];
function empty():State{return Object.fromEntries(names.map(n=>[n,{}])) as State;}
function matches(value:unknown,expected:unknown):boolean{
 if(expected&&typeof expected==="object"&&!Array.isArray(expected)){
  const e=expected as Record<string,unknown>;
  if("$exists" in e)return e.$exists?value!==undefined:value===undefined;
  if("$in" in e)return Array.isArray(e.$in)&&e.$in.includes(value);
  if("$lt" in e)return String(value)<String(e.$lt);
  if("$gt" in e)return String(value)>String(e.$gt);
 }
 return value===expected;
}
class MemoryTx implements Transaction{
 constructor(private state:State){}
 async get<K extends Table>(table:K,id:string){return structuredClone(this.state[table][id]??null);}
 async find<K extends Table>(table:K,query:Query={},limit=1000,sort:Record<string,1|-1>={createdAt:-1,id:-1}){
  const values=Object.values(this.state[table]) as Tables[K][];
  return structuredClone(values.filter(v=>Object.entries(query).every(([k,e])=>matches((v as unknown as Record<string,unknown>)[k],e))).sort((a,b)=>{for(const [key,direction] of Object.entries(sort)){const result=String((a as unknown as Record<string,unknown>)[key]??"").localeCompare(String((b as unknown as Record<string,unknown>)[key]??""));if(result)return result*direction;}return 0;}).slice(0,Math.min(limit,5000)));
 }
 async put<K extends Table>(table:K,value:Tables[K]){(this.state[table] as Record<string,Tables[K]>)[value.id]=structuredClone(value);}
 async insert<K extends Table>(table:K,value:Tables[K]){if(this.state[table][value.id])throw new Error("DUPLICATE_RECORD");await this.put(table,value);}
 async remove(table:Table,id:string){delete this.state[table][id];}
}
export class FileRepository implements Repository{
 constructor(readonly dir:string){}
 private async load(){try{return JSON.parse(await fs.readFile(path.join(this.dir,"preview.json"),"utf8")) as State;}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return empty();throw e;}}
 async read<T>(fn:(tx:Transaction)=>Promise<T>){return fn(new MemoryTx(await this.load()));}
 async transaction<T>(fn:(tx:Transaction)=>Promise<T>):Promise<T>{
  await fs.mkdir(this.dir,{recursive:true});const lock=path.join(this.dir,"write.lock");let acquired=false;
  for(let attempt=0;attempt<200;attempt++){
   try{const f=await fs.open(lock,"wx");await f.writeFile(String(process.pid));await f.close();acquired=true;break;}
   catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;
    try{const pid=Number(await fs.readFile(lock,"utf8"));if(pid){try{process.kill(pid,0);}catch(x){if((x as NodeJS.ErrnoException).code==="ESRCH"){await fs.unlink(lock);continue;}}}}catch{}
    await new Promise(r=>setTimeout(r,20));
   }
  }
  if(!acquired)throw new Error("Preview storage busy. Retry.");
  try{const state=await this.load();const result=await fn(new MemoryTx(state));const tmp=path.join(this.dir,"preview-"+randomUUID()+".tmp");await fs.writeFile(tmp,JSON.stringify(state));await fs.rename(tmp,path.join(this.dir,"preview.json"));return result;}
  finally{await fs.unlink(lock);}
 }
}
class MongoTx implements Transaction{
 constructor(private db:import("mongodb").Db,private session?:ClientSession){}
 private c(name:Table):Collection<Document>{return this.db.collection(name);}
 async get<K extends Table>(table:K,id:string){const d=await this.c(table).findOne({id},{session:this.session});if(!d)return null;const {_id,...rest}=d;void _id;return rest as unknown as Tables[K];}
 async find<K extends Table>(table:K,query:Query={},limit=1000,sort:Record<string,1|-1>={createdAt:-1,id:-1}){const docs=await this.c(table).find(query as Filter<Document>,{session:this.session}).sort(sort).limit(Math.min(limit,5000)).toArray();return docs.map(d=>{const {_id,...rest}=d;void _id;return rest as unknown as Tables[K];});}
 async put<K extends Table>(table:K,value:Tables[K]){await this.c(table).replaceOne({id:value.id},value as unknown as Document,{upsert:true,session:this.session});}
 async insert<K extends Table>(table:K,value:Tables[K]){await this.c(table).insertOne(value as unknown as Document,{session:this.session});}
 async remove(table:Table,id:string){await this.c(table).deleteOne({id},{session:this.session});}
}
class MongoRepository implements Repository{
 async read<T>(fn:(tx:Transaction)=>Promise<T>){const c=await mongoClient();return fn(new MongoTx(c.db(getEnv().MONGODB_DB)));}
 async transaction<T>(fn:(tx:Transaction)=>Promise<T>){const c=await mongoClient();const session=c.startSession();try{return await session.withTransaction(()=>fn(new MongoTx(c.db(getEnv().MONGODB_DB),session)),{readConcern:{level:"snapshot"},writeConcern:{w:"majority"}});}finally{await session.endSession();}}
}
export function repository():Repository{if(getEnv().APP_MODE==="showcase")throw new Error("Hosted showcase has no private data store");return getEnv().APP_MODE==="demo"?new FileRepository(getEnv().DATA_DIR):getEnv().DATABASE_PROVIDER==="postgres"?new PostgresRepository(postgresPool()):new MongoRepository();}
export async function initializeIndexes(){
 if(getEnv().DATABASE_PROVIDER==="postgres")return verifyPostgresSchema(postgresPool());
 const db=(await mongoClient()).db(getEnv().MONGODB_DB);
 for(const name of names)await db.collection(name).createIndex({id:1},{unique:true});
 await db.collection("profiles").createIndex({stripeCustomerId:1},{unique:true,sparse:true});
 await db.collection("generations").createIndex({userId:1,createdAt:-1});
 await db.collection("generations").createIndex({requestId:1},{unique:true,sparse:true});
 await db.collection("generations").createIndex({status:1,updatedAt:1});
 await db.collection("generations").createIndex({isPublic:1,publishedAt:-1});
 for(const name of["projects","uploads","credit_ledger"])await db.collection(name).createIndex({userId:1,createdAt:-1});
 await db.collection("credit_ledger").createIndex({reason:1,refId:1,bucket:1},{unique:true});
 await db.collection("rate_limits").createIndex({expiresAtDate:1},{expireAfterSeconds:0});
 await db.collection("sessions").createIndex({expires:1},{expireAfterSeconds:0});
 await db.collection("verification_tokens").createIndex({expires:1},{expireAfterSeconds:0});
}
