export async function register(){
 if(process.env.NEXT_RUNTIME==="nodejs"&&(process.env.APP_MODE??(process.env.VERCEL?"showcase":"demo"))==="demo"&&process.env.NODE_ENV!=="test"){
  const {reconcile}=await import("./lib/generations/service");
  const state=globalThis as typeof globalThis&{fusionPreviewTimer?:ReturnType<typeof setInterval>;fusionPreviewBusy?:boolean};
  if(!state.fusionPreviewTimer){state.fusionPreviewTimer=setInterval(async()=>{if(state.fusionPreviewBusy)return;state.fusionPreviewBusy=true;try{await reconcile(8);}catch{}finally{state.fusionPreviewBusy=false;}},2000);state.fusionPreviewTimer.unref();}
 }
}
