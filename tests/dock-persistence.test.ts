import {afterEach,describe,it,expect,vi} from "vitest";
import {useDock} from "../lib/client/dock";
import {blankSnapshot} from "../lib/client/draft-storage";
afterEach(()=>{useDock.getState().clear();vi.unstubAllGlobals();});
describe("cross-tab draft ownership",()=>{
 it("preserves a newer persisted prompt when an older tab refreshes its session",()=>{
  const values=new Map<string,string>(),setItem=vi.fn((key:string,value:string)=>values.set(key,value));
  vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem,removeItem:(key:string)=>values.delete(key)});
  useDock.getState().clear();useDock.getState().claim("user1");useDock.getState().update("image",{prompt:"Older tab"});
  const saved={...blankSnapshot(),ownerId:"user1",updatedAt:Date.now()};saved.drafts.image.prompt="Newer tab";
  useDock.setState({updatedAt:saved.updatedAt-100});values.set("fusion-studio-drafts-v1",JSON.stringify({state:saved,version:1}));
  useDock.getState().claim("user1");expect(useDock.getState().drafts.image.prompt).toBe("Newer tab");
  expect(JSON.parse(values.get("fusion-studio-drafts-v1")!).state.drafts.image.prompt).toBe("Newer tab");
  setItem.mockClear();useDock.getState().claim("user1");expect(setItem).not.toHaveBeenCalled();
 });
});
