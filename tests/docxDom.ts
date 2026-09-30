import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pnpmRoot = fileURLToPath(new URL("../node_modules/.pnpm/", import.meta.url));
const cheerioFolder = readdirSync(pnpmRoot).find((name) => name.startsWith("cheerio@"));
if (!cheerioFolder) throw new Error("DOCX 测试需要已安装的 cheerio 传递依赖");
const cheerio: any = require(join(pnpmRoot, cheerioFolder, "node_modules/cheerio"));
// parseHTML 是实例方法（内部引用 this），必须以方法形式调用
const cheerioLoad = cheerio.load as (html: string) => { parseHTML: (html: string) => unknown[] };
const cheerioInstance = cheerioLoad("<body></body>");
const parseHTML = (html: string) => cheerioInstance.parseHTML(html);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

interface MiniNode {
  nodeType: number;
  nodeName: string;
  tagName?: string;
  childNodes: MiniNode[];
  /** 只含元素子节点（对齐 W3C Element.children） */
  children: MiniNode[];
  textContent: string | null;
  attributes: Record<string, string>;
  getAttribute(name: string): string | null;
}

function toMiniNode(input: unknown): MiniNode | null {
  if (input === null || input === undefined) return null;
  const raw = input as {
    type?: string;
    name?: string;
    attribs?: Record<string, string>;
    children?: unknown[];
    data?: string;
    nodeType?: number;
  };
  if (raw.type === "text") {
    return { nodeType: TEXT_NODE, nodeName: "#text", childNodes: [], children: [], textContent: raw.data ?? "", attributes: {}, getAttribute: () => null };
  }
  if (raw.type === "tag" || raw.nodeType === 1) {
    const childNodes = (raw.children ?? []).map(toMiniNode).filter(Boolean) as MiniNode[];
    return {
      nodeType: ELEMENT_NODE,
      nodeName: String(raw.name ?? "div").toUpperCase(),
      tagName: String(raw.name ?? "div").toUpperCase(),
      childNodes,
      children: childNodes.filter((node) => node.nodeType === ELEMENT_NODE),
      textContent: childNodes.map((child) => child.textContent ?? "").join(""),
      attributes: raw.attribs ?? {},
      getAttribute(name: string) {
        return this.attributes[name] ?? null;
      },
    };
  }
  return null;
}

class MiniDOMParser {
  parseFromString(markup: string, _mime: string): { body: MiniNode } {
    const dom = parseHTML(markup);
    // parseHTML 返回顶层节点数组；把全部节点聚成一个 body
    const children = (Array.isArray(dom) ? dom : [dom])
      .map(toMiniNode)
      .filter(Boolean) as MiniNode[];
    const body: MiniNode = {
      nodeType: ELEMENT_NODE,
      nodeName: "BODY",
      tagName: "BODY",
      childNodes: children,
      children,
      textContent: children.map((child) => child.textContent ?? "").join(""),
      attributes: {},
      getAttribute: () => null,
    };
    return { body };
  }
}

(globalThis as Record<string, unknown>).DOMParser = MiniDOMParser;
// Node 常量 polyfill（richTextToDocx 引用了 Node.TEXT_NODE / ELEMENT_NODE）
(globalThis as { Node?: Record<string, number> }).Node = {
  ...( (globalThis as { Node?: Record<string, number> }).Node ?? {} ),
  TEXT_NODE,
  ELEMENT_NODE,
};

