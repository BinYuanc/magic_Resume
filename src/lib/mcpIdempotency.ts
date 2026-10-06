type Entry = { request: string; at: number; state: "pending" | "done" | "failed"; result?: unknown; error?: string };
const KEY = "magic-resume:mcp-idempotency-v1";
const TTL = 24 * 60 * 60 * 1000;
const entries = new Map<string, Entry>();
let loaded = false;
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function persist() {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY, JSON.stringify(Array.from(entries)));
}
/** 浏览器业务端记录，跨桥重连/页面刷新有效。挂起记录拒绝重做，避免未知结果重复写。 */
export function withIdempotency<T>(name: string, args: Record<string, any>, operation: () => T): T {
  if (!args.idempotencyKey) return operation();
  if (!loaded) {
    loaded = true;
    if (typeof sessionStorage !== "undefined") {
      const saved = sessionStorage.getItem(KEY);
      if (saved) for (const [key, entry] of JSON.parse(saved)) entries.set(key,entry);
    }
  }
  for (const [key, entry] of entries) if (Date.now() - entry.at > TTL) entries.delete(key);
  const key = args.idempotencyKey;
  const request = canonical({ name, args });
  const previous = entries.get(key);
  if (previous) {
    if (previous.request !== request) throw new Error("幂等键已用于其他参数，不允许复用");
    if (previous.state === "pending") throw new Error("原操作结果未知，先读取确认；不能重做该写入");
    if (previous.state === "failed") throw new Error(previous.error);
    return structuredClone(previous.result) as T;
  }
  // 达到边界不淘汰未过期写记录，拒绝新键，避免悄悄重放旧请求。
  if (entries.size >= 100) throw new Error("当前会话幂等记录已满（100），请开启新网页会话");
  entries.set(key,{request,at:Date.now(),state:"pending"});
  try { persist(); } catch { entries.delete(key); throw new Error("无法保存幂等记录，写操作未执行；请释放此标签页存储空间"); }
  try {
    const result = operation();
    entries.set(key,{request,at:Date.now(),state:"done",result:structuredClone(result)});
    // 若完成结果太大，存储仍保留 pending；本会话内可返回结果，刷新后拒绝重复操作。
    try { persist(); } catch { /* pending reservation survives */ }
    return result;
  } catch (error) {
    entries.set(key,{request,at:Date.now(),state:"failed",error:error instanceof Error ? error.message : "操作失败"});
    try { persist(); } catch { /* 保留 pending */ }
    throw error;
  }
}
