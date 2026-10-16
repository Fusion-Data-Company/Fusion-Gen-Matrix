import "server-only";
import {MongoClient} from "mongodb";
const shared=globalThis as typeof globalThis & {fusionMongo?:Promise<MongoClient>};
export function mongoClient(){
 const uri=process.env.MONGODB_URI;
 if(!uri)throw new Error("MongoDB is not configured.");
 return shared.fusionMongo??=(new MongoClient(uri,{maxPoolSize:10,serverSelectionTimeoutMS:8000})).connect();
}
