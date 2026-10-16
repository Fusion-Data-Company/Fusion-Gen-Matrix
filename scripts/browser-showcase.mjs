import {chromium,expect} from "@playwright/test";
import fs from "node:fs/promises";
await fs.mkdir("docs/evidence",{recursive:true});
const base=(process.env.BASE_URL||"http://127.0.0.1:3210").replace(/\/$/,"");
const browser=await chromium.launch({channel:"chrome",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[],evidence={startedAt:new Date().toISOString(),base,checks:[]};
page.on("pageerror",error=>errors.push(error.message));
const record=check=>{evidence.checks.push(check);console.log("PASS",check);};
try{
 const response=await context.request.get(base+"/api/studio");expect(response.ok()).toBeTruthy();const state=await response.json();
 expect(state.mode).toBe("showcase");expect(state.user).toBeNull();expect(Object.values(state.capabilities).every(value=>value===false)).toBeTruthy();expect(state.models.length).toBe(85);
 record("Public API exposes showcase mode, 85 verified model contracts, and no live capabilities.");
 for(const path of ["/","/image","/video","/audio","/effects","/community","/assets","/pricing","/account","/account/billing","/login","/admin","/legal/terms","/legal/privacy","/legal/acceptable-use"]){
  const response=await page.goto(base+path,{waitUntil:"networkidle"});expect(response?.status()).toBe(200);await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByText("Public showcase. Rendering and account setup are not enabled.",{exact:true})).toBeVisible();
 }
 record("All 15 public interface routes load and display the correct configuration status.");
 await page.goto(base+"/image",{waitUntil:"networkidle"});
 await expect(page.getByRole("button",{name:/^Generate/})).toBeDisabled();
 await page.getByRole("button",{name:"Change model",exact:true}).click();
 await page.getByRole("textbox",{name:"Search models"}).fill("Qwen");
 const option=page.locator(".model-option").first();await expect(option).toBeVisible();await option.click();
 await page.getByRole("button",{name:"All settings",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"Generation settings"})).toBeVisible();
 await page.getByRole("button",{name:"Done",exact:true}).click();
 await page.getByRole("button",{name:"Log in",exact:true}).click();
 await expect(page.getByRole("button",{name:"Send a magic link",exact:true})).toBeDisabled();
 await page.getByRole("button",{name:"Close dialog",exact:true}).click();
 record("Model search/selection, settings dialogs and disabled account controls work.");
 for(const path of ["/api/demo/login","/api/generations","/api/uploads/direct","/api/billing/checkout"]){
  const response=await context.request.post(base+path,{headers:{Origin:base},data:{email:"operator@preview.local"}});
  expect(response.status()).toBeGreaterThanOrEqual(400);
 }
 const after=await (await context.request.get(base+"/api/studio")).json();expect(after.user).toBeNull();
 record("Public demo login, generation, upload and billing mutations cannot create state.");
 await page.goto(base,{waitUntil:"networkidle"});await page.screenshot({path:"docs/evidence/showcase-desktop.png",fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.goto(base+"/image",{waitUntil:"networkidle"});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 const generate=page.getByRole("button",{name:/^Generate/});await expect(generate).toBeVisible();await expect(generate).toBeDisabled();
 const box=await generate.boundingBox();expect(box).toBeTruthy();expect(box.y+box.height).toBeLessThanOrEqual(844);
 await page.getByRole("button",{name:"Open navigation",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"Studio navigation"})).toBeVisible();
 await page.getByRole("button",{name:"Close dialog",exact:true}).click();
 await page.screenshot({path:"docs/evidence/showcase-mobile.png",fullPage:true});
 record("390px mobile layout has no horizontal overflow, visible Generate control, and working navigation.");
 expect(errors).toEqual([]);record("No browser JavaScript exceptions.");evidence.status="passed";
}catch(error){evidence.status="failed";evidence.error=String(error);await page.screenshot({path:"docs/evidence/showcase-failure.png",fullPage:true});throw error;}
finally{evidence.errors=errors;await fs.writeFile("docs/evidence/browser-showcase.json",JSON.stringify(evidence,null,2));await browser.close();}
