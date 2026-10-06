import { readResumeSettings } from "../src/lib/readResumeSettings";
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./docxDom";
import { zipFiles, unzip } from "../src/lib/templateZip";
import { parseTemplatePackage, buildTemplatePackage, TEMPLATE_LIMITS } from "../src/lib/templateSchema";
import { buildTemplateFromResume } from "../src/lib/templateSave";
import { useCustomTemplateStore } from "../src/store/useCustomTemplateStore";
import { useResumeStore } from "../src/store/useResumeStore";
import { resolveResumeStyle } from "../src/lib/resumeStyle";
import { resolveLegacyResumeData } from "../src/lib/resumePresentation";
import { getBuiltinDefinition } from "../src/lib/templateResolver";
import { buildResumeDocx } from "../src/exporters/docx";
import { buildDocxBytes } from "../src/exporters/docx/docxBuilder";
import { richTextToDocxParagraphs } from "../src/exporters/docx/richTextToDocx";
import SchemaRenderer from "../src/components/templates/schema/SchemaTemplateRenderer";
import { NextIntlClientProvider } from "../src/i18n/compat/client";
import { blankResumeState } from "../src/config/initialResumeData";
import type { ResumeData } from "../src/types/resume";
import type { TemplateDefinition } from "../src/types/templateDefinition";
import { importTemplateFile } from "../src/lib/templateTransfer";
import { makeUniqueTemplateId } from "../src/store/useCustomTemplateStore";
import { colorToHex, isTransparentColor } from "../src/lib/color";
import { templateDefaultSettings } from "../src/lib/resumePresentation";
import { definitionToTemplateView } from "../src/lib/templateCatalog";
import ClassicSectionTitle from "../src/components/templates/classic/sections/SectionTitle";
import { TemplateProvider } from "../src/components/templates/TemplateContext";
import type { TemplateSectionStyle } from "../src/types/templateDefinition";

(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1sAAAAASUVORK5CYII=", "base64"));
const input = { manifest: JSON.stringify({schemaVersion:1,id:"regression-template",name:"Regression template"}),
  layout: JSON.stringify({layout:"two-column", columns:{main:5,side:1}, columnAssignment:{projects:"side"}, order:["projects","skills"], pagePadding:5}),
  theme: JSON.stringify({baseFontSize:23,lineHeight:2.8,colors:{primary:"#123456"},sectionStyles:{projects:{spacing:50,itemSpacing:39}}}) };
const definition = () => parseTemplatePackage(input);
const fixture = (changes: Partial<ResumeData> = {}): ResumeData => ({...structuredClone(blankResumeState),id:"r",templateId:"regression-template",createdAt:"",updatedAt:"",globalSettings:{},...changes} as ResumeData);
const render = (resume:ResumeData, def=definition()) => renderToStaticMarkup(<NextIntlClientProvider locale="zh" messages={{}}><SchemaRenderer data={resume} template={def}/></NextIntlClientProvider>);
const readXml = async (bytes:Uint8Array, name="word/document.xml") => (await unzip(bytes.buffer as ArrayBuffer)).find((f)=>f.name===name)!.text();

test("ZIP: 损坏成员必须被 CRC 拒绝", async()=>{
  const bytes=await zipFiles([{name:"a.txt",data:"abc"}]); bytes[35]^=1;
  const files=await unzip(bytes.buffer as ArrayBuffer); await assert.rejects(files[0].text(),/CRC/);
});
test("ZIP: 注释内的 EOCD 签名不会掩盖真实目录",async()=>{
  const bytes=await zipFiles([{name:"a.txt",data:"abc"}]);
  const commented=new Uint8Array(bytes.length+22);commented.set(bytes);
  new DataView(commented.buffer).setUint16(bytes.length-2,22,true);
  new DataView(commented.buffer).setUint32(bytes.length,0x06054b50,true);
  assert.equal((await unzip(commented.buffer))[0].name,"a.txt");
});
test("ZIP: 声明大小超限和伪造大小的解压流均被限制",async()=>{
  const bytes=await zipFiles([{name:"a.txt",data:"x".repeat(1024*1024)}]);
  const files=await unzip(bytes.buffer as ArrayBuffer); await assert.rejects(files[0].bytes(32),/限制/);
  const view=new DataView(bytes.buffer); const central=view.getUint32(bytes.length-6,true);view.setUint32(central+24,1,true);view.setUint32(22,1,true);
  await assert.rejects((await unzip(bytes.buffer as ArrayBuffer))[0].bytes(32),/限制/);
});
test("ZIP: UTF-8 文件名可往返且写入编码标志",async()=>{
  const bytes=await zipFiles([{name:"中文.json",data:"{}"}]);assert.equal(new DataView(bytes.buffer).getUint16(6,true)&0x800,0x800);
  assert.equal((await unzip(bytes.buffer as ArrayBuffer))[0].name,"中文.json");
});
test("导入: 每个 JSON 解压前受限且重名文件拒绝",async()=>{
  const blob=await zipFiles([{name:"manifest.json",data:"x".repeat(TEMPLATE_LIMITS.jsonBytes+1)},{name:"layout.json",data:"{}"},{name:"theme.json",data:"{}"}]);
  await assert.rejects(importTemplateFile(new File([blob],"large.zip")),/限制|大小/);
  const dup=await zipFiles([{name:"a/manifest.json",data:input.manifest},{name:"b/manifest.json",data:input.manifest},{name:"layout.json",data:input.layout},{name:"theme.json",data:input.theme}]);
  await assert.rejects(importTemplateFile(new File([dup],"duplicate.zip")),/重复文件/);
});
test("Schema: Unicode 转义后的危险字符串也扫描，order 去重补证书",()=>{
  const bad='{'+ '"schemaVersion":1,"id":"abc","name":"Safe","tags":["<\\u0073cript>"]}';
  assert.throws(()=>parseTemplatePackage({...input,manifest:bad}),/script/);
  const def=parseTemplatePackage({...input,layout:JSON.stringify({order:["skills","skills","selfEvaluation"]})});
  assert.equal(def.layout.order!.filter((k)=>k==="skills").length,1);
  assert.ok(def.layout.order!.includes("certificates")); assert.ok(def.layout.order!.includes("summary"));
});
test("Schema: 模块颜色、背景和 layout 页边距规范化",()=>{
  assert.throws(()=>parseTemplatePackage({...input,theme:JSON.stringify({sectionStyles:{skills:{color:'bad'}}})}),/颜色/);
  const def=parseTemplatePackage({...input,theme:JSON.stringify({sectionStyles:{skills:{background:'#abc'}}})});
  assert.equal(def.sectionStyles?.skills.background,"#abc");assert.equal(resolveResumeStyle(def).pagePadding,5);
});
test("旧简历: 保留排版不改内容，默认切换完全重置字号和行高",()=>{
  const def=definition(); useCustomTemplateStore.setState({templates:[def]});
  const old=fixture({templateId:"classic",globalSettings:{baseFontSize:11,lineHeight:1.1,sectionStyles:{projects:{itemSpacing:3}}}});
  useResumeStore.getState().addResume(old);
  useResumeStore.getState().setTemplate(def.id,{preserveOverrides:true});
  assert.equal(useResumeStore.getState().activeResume!.styleOverrides?.global?.baseFontSize,11);
  useResumeStore.getState().setTemplate(def.id,{preserveOverrides:false});
  const changed=useResumeStore.getState().activeResume!;
  assert.equal(readResumeSettings(changed).baseFontSize,23);assert.equal(readResumeSettings(changed).lineHeight,2.8);
  assert.equal(changed.globalSettings.sectionStyles,undefined);assert.deepEqual(changed.projects,old.projects);assert.equal(changed.basic.name,old.basic.name);
});
test("自定义模板新建: 初始化值来自模板",()=>{
  useCustomTemplateStore.setState({templates:[definition()]});useResumeStore.getState().createResume("regression-template",true);
  const resume=useResumeStore.getState().activeResume!;assert.equal(readResumeSettings(resume).baseFontSize,23);assert.equal(readResumeSettings(resume).pagePadding,5);
});
test("保存自定义排版: 比例、栏位、顺序、模块样式不丢失",()=>{
  const def=definition();useCustomTemplateStore.setState({templates:[def]});
  const saved=buildTemplateFromResume(fixture(),{name:"Saved layout"});
  assert.deepEqual(saved.layout.columns,{main:5,side:1});assert.equal(saved.layout.columnAssignment?.projects,"side");
  assert.equal(saved.layout.order?.[0],"projects");assert.equal(saved.sectionStyles?.projects.itemSpacing,39);
  assert.equal(saved.typography.baseFontSize,23);
  const pkg=buildTemplatePackage(saved);
  const roundtrip=parseTemplatePackage({manifest:JSON.stringify(pkg.manifest),layout:JSON.stringify(pkg.layout),theme:JSON.stringify(pkg.theme)});
  assert.deepEqual(roundtrip.layout.columnAssignment,saved.layout.columnAssignment);
});
test("Schema 与 Word: disabled/hidden 模块不能泄漏，summary 标题映射正确",async()=>{
  const resume=fixture({skillContent:"HIDDEN_SKILLS",selfEvaluationContent:"SUMMARY_BODY",menuSections:[{id:"skills",title:"专业技能",icon:"",enabled:false,order:0},{id:"selfEvaluation",title:"我的评价",icon:"",enabled:true,order:1}],styleOverrides:{sections:{skills:{hidden:true}}}});
  assert.ok(!render(resume).includes("HIDDEN_SKILLS"));assert.ok(render(resume).includes("我的评价"));
  const xml=await readXml((await buildResumeDocx(resume,[definition()])).bytes);assert.ok(!xml.includes("HIDDEN_SKILLS"));assert.ok(xml.includes("我的评价"));
});
test("Schema: 模块间距、条目间距、局部字号以及双栏 grid 生效",()=>{
  const projects=[{id:"p",name:"Project1",role:"Role",date:"",description:"",visible:true,nameStyle:{fontSize:29}},{id:"p2",name:"Project2",role:"",date:"",description:"",visible:true}];
  const html=render(fixture({projects}));assert.ok(html.includes("margin-top:39px"));assert.ok(html.includes("margin-bottom:50px"));
  assert.ok(html.includes("font-size:29px"));assert.ok(html.includes("minmax(0, 5fr) minmax(0, 1fr)"));assert.ok(!html.includes("flex-shrink:0"));
});
test("内置模板适配: 覆盖层与 0 间距进入旧组件数据",()=>{
  const resume=fixture({styleOverrides:{global:{baseFontSize:22,sectionSpacing:0},sections:{projects:{itemSpacing:0}}}});
  const resolved=resolveLegacyResumeData(resume,getBuiltinDefinition("classic")!);
  assert.equal(resolved.globalSettings.baseFontSize,22);assert.equal(resolved.globalSettings.sectionSpacing,0);assert.equal(resolved.globalSettings.sectionStyles?.projects?.itemSpacing,0);
});
test("完整 Word 入口: 跨模块编号不复用且纯文本保留",async()=>{
  const resume=fixture({selfEvaluationContent:"<ol><li><p>List A</p></li></ol>",skillContent:"<ol><li><p>List B</p></li></ol>",projects:[{id:"p",name:"Project",role:"",date:"",description:"PLAIN_TEXT",visible:true}]});
  const xml=await readXml((await buildResumeDocx(resume,[definition()])).bytes);
  assert.deepEqual(Array.from(xml.matchAll(/<w:numId w:val="(\d+)"/g),m=>m[1]),["2","3"]);assert.ok(xml.includes("PLAIN_TEXT"));
  assert.equal(richTextToDocxParagraphs("Text").paragraphs[0].runs[0].text,"Text");
});
test("Word: 字体转义、颜色、零间距和行高合法输出",async()=>{
  const bytes=await buildDocxBytes({paragraphs:[{runs:[{text:"x",color:"#abc"}],spacingAfter:0}],orderedListCount:0,fontFamily:"中文&字体",baseFontSize:14,textColor:"rgb(1,2,3)",pagePadding:32,lineHeight:2.8});
  const xml=await readXml(bytes);assert.ok(xml.includes('w:val="aabbcc"'));assert.ok(xml.includes('w:after="0"'));
  const styles=await readXml(bytes,"word/styles.xml");assert.ok(styles.includes("中文&amp;字体"));assert.ok(styles.includes('w:line="672"'));assert.ok(styles.includes('w:val="010203"'));
});
test("证书: Schema 显示、Word 实际嵌入图片并声明关系",async()=>{
  const resume=fixture({certificates:[{id:"cert",url:"data:image/png;base64,"+Buffer.from(png).toString("base64"),width:50}]});
  assert.ok(render(resume).includes("data:image/png;base64"));
  const bytes=(await buildResumeDocx(resume,[definition()])).bytes;
  const files=await unzip(bytes.buffer as ArrayBuffer);assert.ok(files.some((f)=>f.name==="word/media/image1.png"));
  assert.ok((await readXml(bytes)).includes('r:embed="rIdImage1"'));assert.ok((await readXml(bytes,"word/_rels/document.xml.rels")).includes('Target="media/image1.png"'));
});
test("ID 冲突: 保留内置 ID 和 40 字符长度限制",()=>{
  assert.equal(makeUniqueTemplateId("classic",[{id:"classic"}]),"classic-2");
  const base="x".repeat(40);assert.equal(makeUniqueTemplateId(base,[{id:base}]).length,40);
});
test("纯文本: 与 Web 一致地按行拆段且不当作 HTML 解析", () => {
  const multi = richTextToDocxParagraphs("第一行\n第二行");
  assert.deepEqual(multi.paragraphs.map((p)=>p.runs[0]?.text),["第一行","第二行"]);
  assert.equal(richTextToDocxParagraphs("a<b").paragraphs[0].runs[0].text, "a<b");
  assert.deepEqual(richTextToDocxParagraphs("   ").paragraphs, []);
});
test("Word: 透明背景不填充、非法字符不进入 XML", async () => {
  assert.equal(isTransparentColor("rgba(0,0,0,0)"), true);
  assert.equal(isTransparentColor("#12345600"), true);
  assert.equal(isTransparentColor("rgba(0,0,0,0.5)"), false);
  assert.equal(colorToHex("rgba(0,0,0,0)"), "000000"); // 合法颜色，仅透明度需要单独判断
  const bytes = await buildDocxBytes({ paragraphs: [
    { runs: [{ text: "透明" }], background: "rgba(0,0,0,0)" },
    { runs: [{ text: "半透明" }], background: "rgba(255,0,0,0.5)" },
    { runs: [{ text: "a\uFFFFb" }, { text: "x\uD800y" }] },
  ], orderedListCount: 0, fontFamily: "Arial", baseFontSize: 14, textColor: "#000000", pagePadding: 32 });
  const xml = await readXml(bytes);
  assert.equal((xml.match(/<w:shd /g) ?? []).length, 1);
  assert.ok(xml.includes('w:fill="ff0000"'));
  assert.ok(!xml.includes("\uFFFF")); // 非法字符已剥离
  assert.ok(!xml.includes("\uFFFD")); // 落单代理在编码前已丢弃，而不是被替换成 U+FFFD
  assert.ok(xml.includes("ab") && xml.includes("xy"));
});
test("内置模板没有 typography 时保留用户字号，不被系统兜底 14px 覆盖", () => {
  const builtin = templateDefaultSettings(getBuiltinDefinition("classic")!, { baseFontSize: 16, lineHeight: 1.5, pagePadding: 32, themeColor: "#000000" });
  assert.equal(builtin.baseFontSize, 16);   // 改造前新建/切换内置模板是 16，不能变成 14
  assert.equal(builtin.lineHeight, 1.5);
  const declared = templateDefaultSettings(definition(), { baseFontSize: 16, lineHeight: 1.5 });
  assert.equal(declared.baseFontSize, 23);  // 模板声明过的字段仍然以模板为准
  assert.equal(declared.lineHeight, 2.8);
});
test("模板视图: 只声明 layout.pagePadding 也要生效", () => {
  const def = parseTemplatePackage({ ...input, theme: JSON.stringify({ baseFontSize: 15 }) });
  assert.equal(definitionToTemplateView(def).spacing.contentPadding, 5);
});
test("模板 id: 复制长 id 模板不会超过 40 字符", () => {
  const long = "y".repeat(36);
  assert.equal(makeUniqueTemplateId(`${long}-copy`, []).length, 40); // 41 → 截断
  assert.ok(makeUniqueTemplateId(long, [{ id: long }]).length <= 40);
  assert.equal(makeUniqueTemplateId(long, [{ id: long }]), `${long}-2`);
});
test("Schema: columnAssignment 的 selfEvaluation 归一为 summary", () => {
  const def = parseTemplatePackage({ ...input, layout: JSON.stringify({ layout: "two-column", columnAssignment: { selfEvaluation: "side" } }) });
  assert.equal(def.layout.columnAssignment?.summary, "side");
});
test("Word: 对齐值走白名单，注入字符串不进入 XML", async () => {
  const bytes = await buildDocxBytes({ paragraphs: [
    { runs: [{ text: "x" }], align: 'center"/><w:evil' as never },
    { runs: [{ text: "y" }], align: "center" },
  ], orderedListCount: 0, fontFamily: "Arial", baseFontSize: 14, textColor: "#000000", pagePadding: 32 });
  const xml = await readXml(bytes);
  assert.ok(!xml.includes("w:evil"));
  assert.equal((xml.match(/<w:jc /g) ?? []).length, 1);
});

test("内置经典模板: 模块标题下划线必须跟随主题色（不被 undefined shorthand 抹成默认灰）", () => {
  const sectionStyles = { skills: { fontSize: 18, color: "#1234ab", fontWeight: 700, spacing: 0, itemSpacing: 12, align: "left", border: true, hidden: false } as TemplateSectionStyle };
  const html = (border: boolean) => renderToStaticMarkup(
    <TemplateProvider templateId="classic" menuSections={[{ id: "skills", title: "核心技能", icon: "", enabled: true, order: 0 }]}
      sectionStyles={{ skills: { ...sectionStyles.skills, border } }}>
      <ClassicSectionTitle type="skills" globalSettings={{ themeColor: "#1234ab" }} />
    </TemplateProvider>
  );
  // 开启边框（经典模板默认）：下划线颜色必须写出主题色，不能只靠 border-b 的默认灰
  assert.match(html(true), /border-bottom:1px solid #1234ab/);
  // 显式关闭：才应该没有下划线
  assert.match(html(false), /border-bottom:none/);
});
