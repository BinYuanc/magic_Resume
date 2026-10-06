import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { blankResumeState } from "../src/config/initialResumeData";
import type { ResumeData } from "../src/types/resume";
import { migrateResumeStyle } from "../src/lib/styleMigration";
import { migrateResumeBody, parseBodySections } from "../src/lib/bodySections";
import { sanitizePastedHtml } from "../src/lib/pasteSanitize";
import { executeMcpAction } from "../src/lib/mcpActions";
import { useResumeStore } from "../src/store/useResumeStore";
import { readResumeSettings } from "../src/lib/readResumeSettings";
import { buildResumeDocx } from "../src/exporters/docx";
import { unzip } from "../src/lib/templateZip";
import { ResumeSectionHeading } from "../src/components/shared/rich-editor/ResumeSectionHeading";
import StarterKit from "@tiptap/starter-kit";
import { getSchema } from "@tiptap/core";
import { DOMParser as ProseMirrorParser, DOMSerializer } from "@tiptap/pm/model";
import { withIdempotency } from "../src/lib/mcpIdempotency";
import { buildTemplateFromResume } from "../src/lib/templateSave";
import { buildTemplatePackage,parseTemplatePackage } from "../src/lib/templateSchema";
import { useCustomTemplateStore } from "../src/store/useCustomTemplateStore";
import { inspectResumeLayout } from "../src/lib/inspectLayout";
const require = createRequire(import.meta.url);
const domino = createRequire(require.resolve("turndown"))("@mixmark-io/domino");
const win = domino.createWindow("");
if (!win.Element.prototype.closest) win.Element.prototype.closest = function(selector: string) { let node = this; while(node) { if(node.matches(selector)) return node; node=node.parentElement; } return null; };
const values = new Map<string,string>();
Object.assign(globalThis,{Node:win.Node,NodeFilter:win.NodeFilter,DOMParser:class{ parseFromString(html:string){ return domino.createWindow(html).document; } },localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},sessionStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
const fixture = (templateId="classic"):ResumeData => ({ ...structuredClone(blankResumeState),id:"test-resume",templateId,updatedAt:"2026-10-01T00:00:00.000Z",createdAt:"",projects:[{id:"a",name:"Agent",role:"工程师",date:"2024 - 2026",visible:true,description:'<h3>定位</h3><p>保留事实</p>'},{id:"b",name:"Other",role:"",date:"",visible:true,description:""}],basic:{...blankResumeState.basic,name:"测试姓名",title:"测试岗位"},globalSettings:{baseFontSize:17,lineHeight:1.6,paragraphSpacing:12,sectionSpacing:24,centerSubtitle:true,useIconMode:false},menuSections:[{id:"basic",title:"基本信息",icon:"",enabled:true,order:0},{id:"projects",title:"项目经历",icon:"",enabled:true,order:1}] } as ResumeData);
function setup(templateId="classic") { useResumeStore.setState({resumes:{},activeResume:null,activeResumeId:null,history:{},future:{}});useResumeStore.getState().addResume(fixture(templateId)); }
const current=()=>useResumeStore.getState().resumes["test-resume"];
const call=(name:string,args:Record<string,unknown>={})=>executeMcpAction(name,{resumeId:"test-resume",...(name === "get_effective_style" || name === "inspect_layout" ? {} : {expectedUpdatedAt:current().updatedAt}),...args}) as any;
test("迁移幂等：旧样式转覆盖，显式覆盖优先，原内容和时间戳不变",()=>{
 const old=fixture();old.styleOverrides={global:{baseFontSize:20},sections:{projects:{itemSpacing:7}}};old.globalSettings.sectionStyles={projects:{itemSpacing:19}};
 const next=migrateResumeStyle(old);assert.equal(next.styleOverrides?.global?.baseFontSize,20);assert.equal(next.styleOverrides?.sections?.projects.itemSpacing,7);assert.equal(next.globalSettings.baseFontSize,undefined);assert.equal(next.globalSettings.centerSubtitle,true);assert.deepEqual(migrateResumeStyle(next),next);assert.equal(next.updatedAt,old.updatedAt);assert.equal(old.globalSettings.baseFontSize,17);
});
test("UI与MCP写入同一模型，连续版本递增，切模板重置可撤销",()=>{
 setup();useResumeStore.getState().updateGlobalSettings({baseFontSize:19,sectionStyles:{projects:{itemSpacing:8}}});assert.equal(current().globalSettings.baseFontSize,undefined);assert.equal(readResumeSettings(current()).baseFontSize,19);assert.equal(current().styleOverrides?.sections?.projects.itemSpacing,8);
 const before=current().updatedAt;call("set_resume_style",{settings:{baseFontSize:21}});assert.ok(current().updatedAt>before);assert.equal(current().styleOverrides?.global?.baseFontSize,21);
 call("apply_template",{templateId:"minimalist",preserveOverrides:false});assert.equal(readResumeSettings(current()).baseFontSize,16);assert.equal(current().projects[0].name,"Agent");call("undo_resume_change");assert.equal(current().templateId,"classic");assert.equal(readResumeSettings(current()).baseFontSize,21);call("redo_resume_change");assert.equal(current().templateId,"minimalist");
});
test("正文只迁移一次，普通H3与外部粘贴不分块",()=>{
 const legacy=migrateResumeBody(fixture());assert.equal(parseBodySections(legacy.projects[0].description)[0].title,"定位");assert.deepEqual(migrateResumeBody(legacy),legacy);
 const ordinary=fixture();ordinary.bodySectionsVersion=1;assert.equal(parseBodySections(migrateResumeBody(ordinary).projects[0].description).length,1);assert.equal(parseBodySections(ordinary.projects[0].description)[0].title,"");
 const pasted=sanitizePastedHtml('<h3 data-resume-section="1" data-section-id="x">外部标题</h3>');assert.ok(!pasted.includes('data-resume-section'));assert.equal(parseBodySections(pasted)[0].title,"");
});
test("Tiptap 自定义 Node 与普通 heading 可同时往返",()=>{
 const schema=getSchema([StarterKit,ResumeSectionHeading]);const doc=domino.createWindow('<body><h3>普通</h3><h3 data-resume-section="1" data-section-id="stable" data-body-inline="1">正文块</h3><p>内容</p></body>').document;
 const parsed=ProseMirrorParser.fromSchema(schema).parse(doc.body);assert.equal(parsed.child(0).type.name,"heading");assert.equal(parsed.child(1).type.name,"resumeSectionHeading");assert.equal(parsed.child(1).attrs.sectionId,"stable");assert.equal(parsed.child(1).attrs.inline,true);
 const container=doc.createElement('div');container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(parsed.content,{document:doc}));assert.match(container.innerHTML,/data-resume-section="1"/);
});
test("条目局部更新/排序/新增/删除保留其他条目且旧版本拒绝",()=>{
 setup();const untouched=structuredClone(current().projects[1]);const version=current().updatedAt;call("mutate_resume_item",{section:"projects",action:"update",itemId:"a",patch:{role:"新岗位"}});assert.deepEqual(current().projects[1],untouched);
 assert.throws(()=>call("mutate_resume_item",{expectedUpdatedAt:version,section:"projects",action:"delete",itemId:"b"}),/已被修改/);
 call("mutate_resume_item",{section:"projects",action:"move_down",itemId:"a"});assert.equal(current().projects[1].id,"a");
 call("mutate_resume_item",{section:"projects",action:"add",patch:{name:"新增",role:"",date:"",description:"<p>示例</p>"}});const added=current().projects[2].id;call("mutate_resume_item",{section:"projects",action:"delete",itemId:added});assert.equal(current().projects.length,2);
 assert.throws(()=>call("mutate_resume_item",{section:"projects",action:"update",itemId:"a",patch:{id:"b"}}),/不支持/);
});
test("MCP 正文块编辑、移动、同行、删除使用稳定ID",()=>{
 setup();const first=call("manage_body_sections",{section:"projects",itemId:"a",action:"list"}).sections[0];call("manage_body_sections",{section:"projects",itemId:"a",action:"add",title:"成果",content:"<p>真实内容</p>"});
 let sections=call("manage_body_sections",{section:"projects",itemId:"a",action:"list"}).sections;assert.equal(sections[0].id,first.id);
 const id=sections[1].id;call("manage_body_sections",{section:"projects",itemId:"a",action:"set_inline",bodySectionId:id,inline:true});call("manage_body_sections",{section:"projects",itemId:"a",action:"move_up",bodySectionId:id});sections=call("manage_body_sections",{section:"projects",itemId:"a",action:"list"}).sections;assert.equal(sections[0].title,"成果");assert.equal(sections[0].inline,true);
 call("manage_body_sections",{section:"projects",itemId:"a",action:"delete",bodySectionId:first.id});assert.equal(parseBodySections(current().projects[0].description).length,1);
});
test("模块与字段样式生效，reset恢复继承，幂等重试不再修改版本",()=>{
 setup();call("set_section_style",{sectionId:"projects",style:{itemSpacing:7,fontSize:22}});call("set_item_style",{section:"projects",itemId:"a",target:"name",style:{fontSize:24}});assert.equal(current().projects[0].nameStyle?.fontSize,24);const effective=call("get_effective_style",{sectionId:"projects"});assert.equal(effective.sections.projects.itemSpacing,7);
 const args={section:"projects",action:"add",patch:{name:"只新增一次",role:"",date:"",description:""},idempotencyKey:"test-item-add-001",expectedUpdatedAt:current().updatedAt};const first=call("mutate_resume_item",args);const version=current().updatedAt;const retry=call("mutate_resume_item",args);assert.deepEqual(retry,first);assert.equal(current().projects.length,3);assert.equal(current().updatedAt,version);assert.throws(()=>call("mutate_resume_item",{...args,patch:{...args.patch,name:"其他"}}),/幂等键/);
 call("set_section_style",{sectionId:"projects",reset:true});assert.equal(current().styleOverrides?.sections?.projects,undefined);
});
test("幂等预写失败时不执行操作",()=>{
 const previous=globalThis.sessionStorage;Object.assign(globalThis,{sessionStorage:{getItem:()=>null,setItem:()=>{throw new Error("quota");}}});let calls=0;try{assert.throws(()=>withIdempotency("test",{idempotencyKey:"quota-key-001"},()=>++calls),/未执行/);assert.equal(calls,0);}finally{Object.assign(globalThis,{sessionStorage:previous});}
});
test("经典/极简 Word 保留并排页头、三栏条目、分块字号和合法关系",async()=>{
 for(const id of ["classic","minimalist"]){setup(id);const result=await buildResumeDocx(current());assert.equal(result.simplified,false);const files=await unzip(result.bytes.buffer as ArrayBuffer);const xml=await files.find(f=>f.name==='word/document.xml')!.text();assert.match(xml,/<w:tbl>/);assert.match(xml,/<w:tblLayout w:type="fixed"/);assert.match(xml,/<w:keepNext\/>/);assert.match(xml,/w:sz w:val="45"/);assert.match(xml,/w:sz w:val="27"/);assert.match(xml,/测试姓名/);assert.match(xml,/保留事实/);assert.equal(xml.includes('<w:pBdr>'),id==='classic');}
 // 装饰差异（图标/自由头部）不再等同简化布局，单独上报
 setup("classic");const decorated=structuredClone(current());decorated.globalSettings={...decorated.globalSettings,useIconMode:true,flexibleHeaderLayout:true};
 const decoratedResult=await buildResumeDocx(decorated);assert.equal(decoratedResult.simplified,false);assert.deepEqual(decoratedResult.decorationsOmitted,["contactIcons","flexibleHeaderLayout"]);
 // 未做成 full 的模板仍然是简化布局，且不产生装饰提示
 setup("modern");const basicResult=await buildResumeDocx(current());assert.equal(basicResult.simplified,true);assert.deepEqual(basicResult.decorationsOmitted,[]);
});
test("排版测量忽略页面预览缩放，记录真实内容与单页溢出",()=>{
 setup();const section={dataset:{resumeSectionId:'projects'},getBoundingClientRect:()=>({height:450})};const content={offsetWidth:700,clientWidth:700,scrollWidth:700,offsetHeight:1100,scrollHeight:1100,querySelectorAll:()=>[section]};const root={offsetWidth:794,getBoundingClientRect:()=>({width:397}),querySelector:()=>content};const previous=(globalThis as any).document;Object.assign(globalThis,{document:{fonts:{status:'loaded'},getElementById:()=>root}});try{const layout=inspectResumeLayout(current(),'test-resume');assert.equal(layout.pageCount,2);assert.equal(layout.sections.projects.height,900);assert.ok(layout.overflowPixels>0);assert.throws(()=>inspectResumeLayout(current(),'other'),/目标简历/);}finally{Object.assign(globalThis,{document:previous});}
});

test("保存已迁移简历为模板：有效样式、局部正文与语义块往返不丢，创建用示例",()=>{
 setup();call("set_item_style",{section:"projects",itemId:"a",target:"body",style:{fontSize:23,color:"#123456",bold:true}});const original=structuredClone(current());const saved=buildTemplateFromResume(original,{name:"格式复用测试"});const restored=parseTemplatePackage(Object.fromEntries(Object.entries(buildTemplatePackage(saved)).map(([key,value])=>[key,JSON.stringify(value)])) as any);
 assert.equal(restored.typography.baseFontSize,17);assert.match(restored.savedPresentation!.example.projects[0].description,/font-size:23px|font-size: 23px/);assert.match(restored.savedPresentation!.example.projects[0].description,/data-resume-section="1"/);assert.ok(!JSON.stringify(restored).includes("保留事实"));assert.deepEqual(current(),original);
 useCustomTemplateStore.getState().addTemplate(restored);useResumeStore.getState().createResume(restored.id);const created=useResumeStore.getState().activeResume!;assert.equal(readResumeSettings(created).baseFontSize,17);assert.equal(created.globalSettings.baseFontSize,undefined);assert.equal(created.basic.name,"示例候选人");
});
test("自定义模板切换后 Undo/Redo 保留已存在模板 ID",()=>{
 setup();const saved=buildTemplateFromResume(current(),{name:"自定义历史测试"});useCustomTemplateStore.getState().addTemplate(saved);call("apply_template",{templateId:saved.id});assert.equal(current().templateId,saved.id);call("undo_resume_change");assert.equal(current().templateId,"classic");call("redo_resume_change");assert.equal(current().templateId,saved.id);
});

test("幂等创建模板重试只创建一次；同键换工具拒绝",()=>{
 setup();const before=useCustomTemplateStore.getState().templates.length;const args={resumeId:"test-resume",name:"幂等模板示例",idempotencyKey:"template-create-001"};const first=executeMcpAction("save_resume_as_template",args);const next=executeMcpAction("save_resume_as_template",args);assert.deepEqual(next,first);assert.equal(useCustomTemplateStore.getState().templates.length,before+1);assert.throws(()=>executeMcpAction("create_resume",{templateId:"classic",title:"新简历",idempotencyKey:args.idempotencyKey}),/幂等键/);
});
test("localStorage 旧版本重载自动迁移而不改时间戳与个人文字",async()=>{
 const options=useResumeStore.persist.getOptions();const old=fixture();useResumeStore.persist.setOptions({storage:{getItem:()=>({state:{resumes:{[old.id]:old},activeResumeId:old.id},version:0}),setItem:()=>{},removeItem:()=>{}}});
 try { await useResumeStore.persist.rehydrate();assert.equal(current().styleModelVersion,1);assert.equal(current().bodySectionsVersion,1);assert.equal(current().updatedAt,old.updatedAt);assert.equal(current().projects[0].name,old.projects[0].name);assert.equal(current().globalSettings.baseFontSize,undefined);assert.equal(readResumeSettings(current()).baseFontSize,17); } finally { useResumeStore.persist.setOptions(options); }
});
