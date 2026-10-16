export class ApiError extends Error {
  constructor(message:string, public code:string, public status:number) { super(message); this.name="ApiError"; }
}
export async function api<T>(path:string, init?:RequestInit):Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type","application/json");
  const response=await fetch(path,{...init,headers,credentials:"same-origin",cache:"no-store"});
  let data:unknown;
  try { data=await response.json(); } catch { throw new ApiError("The server returned an unreadable response. Try again.","INVALID_RESPONSE",response.status); }
  if (!response.ok) {
    const error=data && typeof data==="object" ? data as Record<string,unknown> : {};
    throw new ApiError(typeof error.error==="string"?error.error:"The request could not be completed.", typeof error.code==="string"?error.code:"REQUEST_FAILED",response.status);
  }
  return data as T;
}
export function post<T>(path:string,body:unknown) {return api<T>(path,{method:"POST",body:JSON.stringify(body)});}
export const messageOf=(error:unknown)=>error instanceof Error?error.message:"Something went wrong. Please try again.";
export const isActive=(status:string)=>["pending_submit","queued","in_progress"].includes(status);
export const formatDate=(value:string)=>new Date(value).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
