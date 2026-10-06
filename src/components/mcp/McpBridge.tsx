import { useEffect } from "react";
import { create } from "zustand";
import { executeMcpAction } from "@/lib/mcpActions";
import { tools } from "../../../mcp/tools.mjs";

const KEY = "magic-resume-mcp-connection";
type Connection = { url: string; token: string; clientId?: string };
type BridgeState = { connection: Connection | null; status: string; connected: boolean; lastAction: string; connect: (connection: Connection) => void; disconnect: () => void };
export const useMcpBridge = create<BridgeState>((set) => ({
  connection: null, status: "未连接", connected: false, lastAction: "",
  connect: (connection) => {
    const url = new URL(connection.url);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password) throw new Error("桥接地址必须是 http://127.0.0.1:端口");
    if (!/^[a-f0-9]{48}$/.test(connection.token.trim())) throw new Error("配对码格式无效，请在 MCP 客户端中调用 get_connection_info 获取");
    const next = { url: url.origin, token: connection.token.trim(), clientId: connection.clientId && /^[\w-]{8,80}$/.test(connection.clientId) ? connection.clientId : crypto.randomUUID() };
    sessionStorage.setItem(KEY, JSON.stringify(next));
    set({ connection: next, status: "正在连接", connected: false });
  },
  disconnect: () => { sessionStorage.removeItem(KEY); set({ connection: null, status: "未连接", connected: false }); },
}));

// 全局只挂一个桥；路由切换不影响连接，关闭/断开网页就停止访问。
export function McpBridge() {
  const connection = useMcpBridge((state) => state.connection);
  const status = useMcpBridge((state) => state.status);
  const connected = useMcpBridge((state) => state.connected);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(KEY); if (saved) useMcpBridge.getState().connect(JSON.parse(saved)); } catch { sessionStorage.removeItem(KEY); }
  }, []);
  useEffect(() => {
    if (!connection) return;
    const clientId = connection.clientId!;
    const abort = new AbortController();
    let stopped = false;
    const completed = new Map<string, { result?: unknown; error?: string }>();
    const request = async (path: string, data: Record<string, unknown> = {}) => {
      const response = await fetch(`${connection.url}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.token}` }, body: JSON.stringify({ ...data, clientId }), signal: abort.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `连接错误 ${response.status}`);
      return body;
    };
    const pause = () => new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); abort.signal.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, 800);
      abort.signal.addEventListener("abort", finish, { once: true });
    });
    async function run() {
      try {
        await request("/connect");
        if (stopped) return;
        useMcpBridge.setState({ status: "MCP 客户端已连接", connected: true });
        while (!stopped) {
          const task = await request("/poll");
          if (stopped) return;
          if (task) {
            let payload = completed.get(task.id);
            if (!payload) {
              try { payload = { result: executeMcpAction(task.name, task.arguments) }; }
              catch (error) { payload = { error: error instanceof Error ? error.message : "执行失败" }; }
              completed.set(task.id, payload);
              if (completed.size > 100) completed.delete(completed.keys().next().value!);
              const readOnly = tools.find((item: { name: string }) => item.name === task.name)?.annotations.readOnlyHint;
              if (!readOnly) useMcpBridge.setState({ lastAction: `${payload.error ? "失败" : "已完成"}：${task.name} · ${new Date().toLocaleTimeString()}` });
            }
            await request("/result", { id: task.id, ...payload });
          }
          await pause();
        }
      } catch (error) {
        if (!stopped) useMcpBridge.setState({ status: error instanceof Error ? error.message : "连接中断；请重新连接", connected: false });
      }
    }
    const startup = setTimeout(() => void run(), 0);
    return () => {
      stopped = true; clearTimeout(startup); abort.abort();
      void fetch(`${connection.url}/disconnect`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.token}` }, body: JSON.stringify({ clientId }), keepalive: true }).catch(() => {});
    };
  }, [connection]);
  if (!connection) return null;
  return <div className="fixed bottom-3 left-3 z-50 max-w-xs rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm" role="status">
    <span className={connected ? "text-green-600" : "text-muted-foreground"}>{status}</span>
    <BridgeActivity />
    <button className="ml-3 underline" onClick={() => useMcpBridge.getState().disconnect()}>断开 MCP</button>
  </div>;
}

function BridgeActivity() {
  const last = useMcpBridge((state) => state.lastAction);
  return last ? <div className="mt-1 text-muted-foreground">{last}</div> : null;
}
