import {api} from "@/lib/http";
import {requireUser} from "@/lib/auth/server";
import {repository} from "@/lib/db/repository";
export const dynamic="force-dynamic";
export async function GET(request:Request){return api(async()=>{const user=await requireUser(request);return {user,ledger:await repository().read(tx=>tx.find("credit_ledger",{userId:user.id},500))};});}
