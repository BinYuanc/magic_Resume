import test from "node:test";
import assert from "node:assert/strict";
import { resolveFontSize, resolveNumber, resolveTextStyle } from "../src/lib/textStyle";
import { snapshotFromMarks, type MarkLike } from "../src/components/shared/rich-editor/useFormatPainter";
import { FONT_SIZE_STEPS, nextFontSizeStep, resolveStepAnchor } from "../src/components/shared/rich-editor/FontSizeStepButtons";
import type { Project } from "../src/types/resume";

// ---------- resolveFontSize / resolveNumber：三级 fallback 链 ----------
test("resolveFontSize: 局部 > 全局 > 模板默认", () => {
  assert.equal(resolveFontSize(18, 14, 16), "18px"); // 局部优先
  assert.equal(resolveFontSize(undefined, 14, 16), "14px"); // 无局部走全局
  assert.equal(resolveFontSize(undefined, undefined, 16), "16px"); // 全缺省走模板默认
  assert.equal(resolveFontSize(), "16px"); // fallback 默认 16
});

test("resolveNumber: 局部 > 全局 > 0", () => {
  assert.equal(resolveNumber(8, 6, 4), 8);
  assert.equal(resolveNumber(undefined, 6, 4), 6);
  assert.equal(resolveNumber(undefined, undefined, 4), 4);
  assert.equal(resolveNumber(), 0);
});

test("resolveTextStyle: 只输出存在的字段，字号走 fallback 链", () => {
  // 空局部样式：仅字号（继承全局）
  assert.deepEqual(resolveTextStyle(undefined, 14, 16), { fontSize: "14px" });
  // 局部完整样式
  assert.deepEqual(
    resolveTextStyle({ fontSize: 18, color: "#f00", bold: true, italic: true, underline: true }, 14, 16),
    { fontSize: "18px", color: "#f00", fontWeight: 700, fontStyle: "italic", textDecoration: "underline" },
  );
  // bold=false 必须显式输出 400（用于覆盖模板默认粗体）
  assert.deepEqual(resolveTextStyle({ bold: false }, undefined, 16), { fontSize: "16px", fontWeight: 400 });
});

// ---------- 旧数据兼容：没有 nameStyle/roleStyle 的 Project 不受影响 ----------
test("旧版 Project（无 nameStyle/roleStyle）JSON 往返不变且渲染走默认", () => {
  const legacy: Project = {
    id: "p1",
    name: "教育问答系统",
    role: "后端开发",
    date: "2025.01 - 2025.06",
    description: "<p>负责 RAG 链路</p>",
    visible: true,
  } as Project;
  // 序列化/反序列化不应多字段
  const roundTrip = JSON.parse(JSON.stringify(legacy)) as Project;
  assert.deepEqual(roundTrip, legacy);
  assert.equal(roundTrip.nameStyle, undefined);
  assert.equal(roundTrip.roleStyle, undefined);
  // 渲染层解析必须落到 fallback，而不是抛错或产出 undefinedpx
  assert.deepEqual(resolveTextStyle(roundTrip.nameStyle, 14, 16), { fontSize: "14px" });
  assert.deepEqual(resolveTextStyle(roundTrip.roleStyle, undefined, 15), { fontSize: "15px" });
});

// ---------- 格式刷快照：忽略 link，提取 inline 格式 ----------
function fakeMark(name: string, attrs: Record<string, unknown> = {}): MarkLike {
  return { type: { name }, attrs };
}

test("snapshotFromMarks: 提取 bold/italic/underline/textStyle/highlight，忽略 link", () => {
  const snapshot = snapshotFromMarks([
    fakeMark("bold"),
    fakeMark("underline"),
    fakeMark("textStyle", { fontSize: "18px", color: "#123456" }),
    fakeMark("highlight", { color: "#ffff00" }),
    fakeMark("link", { href: "https://example.com" }),
  ]);
  assert.deepEqual(snapshot, {
    bold: true,
    italic: false,
    underline: true,
    fontSize: "18px",
    color: "#123456",
    highlight: "#ffff00",
  });
  // link 不允许进入快照（不能出现在结果类型里以外的任何字段）
  assert.ok(!("link" in snapshot));
  assert.ok(!("href" in snapshot));
});

test("snapshotFromMarks: 空 marks 返回全默认", () => {
  assert.deepEqual(snapshotFromMarks([]), { bold: false, italic: false, underline: false });
});

// ---------- 字号档位步进 ----------
test("nextFontSizeStep: 沿档位阶梯上下，不越界", () => {
  assert.equal(nextFontSizeStep(14, 1), 15);
  assert.equal(nextFontSizeStep(14, -1), 13);
  assert.equal(nextFontSizeStep(16, 1), 18); // 跳过不存在的 17
  assert.equal(nextFontSizeStep(17, 1), 18); // 非档位值向上取最近档
  assert.equal(nextFontSizeStep(17, -1), 16);
  assert.equal(nextFontSizeStep(FONT_SIZE_STEPS[FONT_SIZE_STEPS.length - 1], 1), 32); // 顶端封顶
  assert.equal(nextFontSizeStep(FONT_SIZE_STEPS[0], -1), 10); // 底端封底
});

test("resolveStepAnchor: 默认字号下 A+ 从简历默认字号往上走", () => {
  // 默认 16px：A+ 得 18px，A- 得 15px（而不是从写死的 14px 出发得 15px）
  assert.equal(nextFontSizeStep(resolveStepAnchor(null, 16), 1), 18);
  assert.equal(nextFontSizeStep(resolveStepAnchor(null, 16), -1), 15);
  // 默认 15px：A+ 得 16px
  assert.equal(nextFontSizeStep(resolveStepAnchor(null, 15), 1), 16);
  // 已设显式字号时以显式字号为准
  assert.equal(resolveStepAnchor(13, 16), 13);
  assert.equal(nextFontSizeStep(resolveStepAnchor(13, 16), 1), 14);
  // 拿不到简历默认字号时兜底 14px
  assert.equal(resolveStepAnchor(null, Number.NaN), 14);
  assert.equal(resolveStepAnchor(null, 0), 14);
  assert.equal(resolveStepAnchor(null, -5), 14);
});
