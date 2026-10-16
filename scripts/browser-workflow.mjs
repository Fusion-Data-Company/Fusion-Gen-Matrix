import {chromium,expect,request as apiRequest} from "@playwright/test";
import fs from "node:fs/promises";
await fs.mkdir("docs/evidence",{recursive:true});
const base=process.env.BASE_URL||"http://127.0.0.1:3210";
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>localStorage.setItem("fusion-consent","essential"));
const page=await context.newPage(),errors=[],requestFailures=[],consoleErrors=[],evidence={startedAt:new Date().toISOString(),checks:[]};
page.on("pageerror",error=>errors.push(error.message));
page.on("requestfailed",request=>requestFailures.push({url:request.url().split("?")[0],error:request.failure()?.errorText}));
page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());});
const record=(check)=>{evidence.checks.push(check);console.log("PASS",check);};
const origin={Origin:base};
async function post(client,path,body){const response=await client.post(base+path,{headers:origin,data:body});return {response,data:await response.json()};}
async function waitComplete(client,id){for(let i=0;i<25;i++){const response=await client.get(base+"/api/generations/status?ids="+id);const data=await response.json(),g=data.items?.[0];if(g&&["completed","failed","nsfw","canceled"].includes(g.status))return g;await new Promise(r=>setTimeout(r,500));}throw new Error("Generation did not reach a terminal status");}
try{
 await page.goto(base+"/image",{waitUntil:"networkidle"});
 await page.getByRole("button",{name:"Log in",exact:true}).click();
 await page.getByLabel("Email address",{exact:true}).fill("operator@preview.local");
 await page.getByRole("button",{name:"Enter local preview",exact:true}).click();
 await expect(page.getByRole("button",{name:"Account menu"})).toBeVisible();
 record("Browser local preview sign-in works.");
 await page.getByRole("textbox",{name:/^Prompt/}).fill("Browser QA: a sculptural ceramic object with soft side lighting.");
 const created=page.waitForResponse(response=>response.url().endsWith("/api/generations")&&response.request().method()==="POST");
 await page.getByRole("button",{name:/Generate preview/}).click();
 const createdResponse=await created;expect(createdResponse.ok()).toBeTruthy();const first=(await createdResponse.json()).generation;
 const done=await waitComplete(context.request,first.id);expect(done.status).toBe("completed");
 await expect(page.getByRole("button",{name:/Open generation Browser QA/})).toBeVisible();
 await page.screenshot({path:"docs/evidence/generated-image-desktop.png",fullPage:true});
 await page.reload({waitUntil:"networkidle"});await expect(page.getByRole("button",{name:/Open generation Browser QA/})).toBeVisible();
 record("Image preview completes and retained history survives page reload.");
 const image=await context.request.get(base+done.outputs[0].url);expect(image.status()).toBe(200);expect(image.headers()["content-type"]).toContain("image/");
 record("Private retained output loads for its owner.");
 const project=await post(context.request,"/api/projects",{name:"Browser verification project"});expect(project.response.ok()).toBeTruthy();
 const projectId=project.data.project.id;
 expect((await post(context.request,"/api/generations/"+first.id,{action:"move",projectId})).response.ok()).toBeTruthy();
 const renamed=await context.request.patch(base+"/api/projects/"+projectId,{headers:origin,data:{name:"Verified project"}});expect(renamed.ok()).toBeTruthy();
 await page.goto(base+"/projects/"+projectId,{waitUntil:"networkidle"});await expect(page.getByRole("heading",{name:"Verified project",exact:true})).toBeVisible();
 record("Project create, move, rename and project view work.");
 const second=await apiRequest.newContext();
 const other=await post(second,"/api/demo/login",{email:"browser-isolation-"+Date.now()+"@preview.test"});expect(other.response.ok()).toBeTruthy();
 for(const method of ["read","publish","delete"]){
  const response=method==="read"?await second.get(base+"/api/generations/"+first.id):(await post(second,"/api/generations/"+first.id,{action:method})).response;
  expect(response.status()).toBe(404);
 }
 expect((await second.get(base+done.outputs[0].url)).status()).toBe(404);
 expect((await second.delete(base+"/api/projects/"+projectId,{headers:origin})).status()).toBe(404);
 record("A second user cannot read, publish, delete, or fetch another user's private media/project.");
 const csrf=await context.request.post(base+"/api/projects",{data:{name:"Must fail"}});expect(csrf.status()).toBe(403);
 record("Missing-origin mutation is rejected.");
 expect((await post(context.request,"/api/generations/"+first.id,{action:"publish"})).response.ok()).toBeTruthy();
 const shared=await second.get(base+"/api/generations/"+first.id),sharedData=await shared.json();expect(shared.status()).toBe(200);
 for(const field of ["debit","quoteUsd","requestId","inputHash","projectId","providerMedia"])expect(field in sharedData.generation).toBe(false);
 expect(sharedData.generation.media).toEqual([]);
 expect((await second.get(base+done.outputs[0].url)).status()).toBe(200);
 await post(context.request,"/api/generations/"+first.id,{action:"unpublish"});
 expect((await second.get(base+done.outputs[0].url)).status()).toBe(404);
 record("Explicit publication works and exposes only the public DTO; unpublish revokes access.");
 const upload=await context.request.post(base+"/api/uploads",{headers:origin,multipart:{file:{name:"reference.png",mimeType:"image/png",buffer:await fs.readFile("public/fixtures/demo-motion-frame.png")}}});
 expect(upload.ok()).toBeTruthy();const uploadData=await upload.json();expect(uploadData.upload.providerUrl).toBeUndefined();
 expect((await second.get(base+uploadData.upload.url)).status()).toBe(404);
 record("Validated upload is privately retained and hidden from other users.");
 const createInput={modelId:"alibaba/qwen-image-3/text-to-image",prompt:"API lifecycle browser test",settings:{},media:[]};
 const balance=async()=>{const r=await context.request.get(base+"/api/account");const d=await r.json();return d.user.subscriptionCredits+d.user.topupCredits;};
 for(const outcome of ["failed","nsfw"]){const before=await balance(),result=await post(context.request,"/api/generations",{...createInput,idempotencyKey:crypto.randomUUID(),demoOutcome:outcome});expect(result.response.ok()).toBeTruthy();const terminal=await waitComplete(context.request,result.data.generation.id);expect(terminal.status).toBe(outcome);await post(context.request,"/api/generations/"+terminal.id,{action:"refresh"});expect(await balance()).toBe(before);}
 record("Failed and filtered preview runs refund once through the real HTTP workflow.");
 const beforeCancel=await balance(),cancelRun=await post(context.request,"/api/generations",{...createInput,idempotencyKey:crypto.randomUUID()});expect(cancelRun.response.ok()).toBeTruthy();
 const canceled=await post(context.request,"/api/generations/"+cancelRun.data.generation.id,{action:"cancel"});expect(canceled.data.generation.status).toBe("canceled");await post(context.request,"/api/generations/"+cancelRun.data.generation.id,{action:"cancel"});expect(await balance()).toBe(beforeCancel);
 record("Cancellation retains a visible state and refunds only once.");
 await post(context.request,"/api/demo/credits",{amount:100});
 const video=await post(context.request,"/api/generations",{modelId:"bytedance/seedance-2.5/text-to-video",prompt:"Browser QA: a slow orbit around a geometric object.",settings:{},media:[],idempotencyKey:crypto.randomUUID()});
 expect(video.response.ok()).toBeTruthy();const videoDone=await waitComplete(context.request,video.data.generation.id);expect(videoDone.status).toBe("completed");
 const ranged=await context.request.get(base+videoDone.outputs[0].url,{headers:{Range:"bytes=0-1023"}});expect(ranged.status()).toBe(206);expect((await ranged.body()).length).toBe(1024);
 await page.goto(base+"/video",{waitUntil:"networkidle"});await page.screenshot({path:"docs/evidence/generated-video-desktop.png",fullPage:true});
 record("Video preview completes and retained MP4 supports range requests.");
 await page.goto(base+"/admin",{waitUntil:"networkidle"});await expect(page.getByRole("heading",{name:/Administration/})).toBeVisible();await page.screenshot({path:"docs/evidence/admin-desktop.png",fullPage:true});
 record("Operator can open administration.");
 await page.setViewportSize({width:390,height:844});await page.goto(base+"/image",{waitUntil:"networkidle"});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await expect(page.getByRole("button",{name:/Generate preview/})).toBeVisible();await page.screenshot({path:"docs/evidence/generated-image-mobile.png",fullPage:true});
 record("390px mobile layout has no horizontal overflow and Generate remains reachable.");
 await second.dispose();
 expect(errors).toEqual([]);record("No browser JavaScript exceptions.");
 evidence.status="passed";evidence.errors=errors;
}catch(error){evidence.status="failed";evidence.error=String(error);evidence.errors=errors;evidence.requestFailures=requestFailures;evidence.consoleErrors=consoleErrors;await page.screenshot({path:"docs/evidence/workflow-failure.png",fullPage:true});throw error;}
finally{await fs.writeFile("docs/evidence/browser-workflow.json",JSON.stringify(evidence,null,2));await browser.close();}
