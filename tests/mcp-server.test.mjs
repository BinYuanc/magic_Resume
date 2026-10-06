import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { request as httpRequest } from "node:http";
import { tools, validate } from "../mcp/tools.mjs";

function start(port = "0") {
  const child = spawn(process.execPath, [new URL("../mcp/server.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")], { env: { ...process.env, MAGIC_RESUME_BRIDGE_PORT: port }, stdio: ["pipe", "pipe", "pipe"] });
  let sequence = 0; const pending = new Map(); let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => { const message = JSON.parse(line); const waiter = pending.get(message.id); if (waiter) { clearTimeout(waiter.timer); pending.delete(message.id); waiter.resolve(message); } });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, timer: setTimeout(() => { pending.delete(id); reject(new Error(`MCP response timeout: ${stderr}`)); }, 4000) });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  const close = () => { lines.close(); child.kill(); for (const waiter of pending.values()) clearTimeout(waiter.timer); };
  return { rpc, child, close };
}
const data = (response) => JSON.parse(response.result.content[0].text);
const call = (client, name, args = {}) => client.rpc("tools/call", { name, arguments: args });

test("MCP stdio 初始化、工具发现、未连接提示、参数限制", async () => {
  const client = start();
  try {
    const init = await client.rpc("initialize", { protocolVersion: "2025-06-18", clientInfo: { name: "test", version: "1" }, capabilities: {} });
    assert.equal(init.result.protocolVersion, "2025-06-18");
    assert.ok(init.result.capabilities.tools);
    const list = await client.rpc("tools/list");
    assert.equal(list.result.tools.length, 21);
    assert.ok(list.result.tools.find((tool) => tool.name === "create_template"));
    assert.equal((await call(client, "list_resumes")).result.isError, true);
    assert.equal((await call(client, "update_resume", { resumeId: "x", patch: {} })).result.isError, true);
    assert.equal((await call(client, "unknown")).result.isError, true);
    assert.equal((await client.rpc("bad-method")).error.code, -32601);
  } finally { client.close(); }
});

test("本地桥 Origin/Host/配对认证、单网页占用、操作投递一次、回传与断开", async () => {
  const client = start();
  try {
    const info = data(await call(client, "get_connection_info"));
    const request = (path, body, options = {}) => fetch(info.bridgeUrl + path, { method: "POST", headers: { Origin: "http://localhost:3000", Authorization: `Bearer ${info.pairingCode}`, "Content-Type": "application/json", ...options.headers }, body: JSON.stringify({ clientId: "browser-test-123", ...body }) });
    assert.equal((await request("/connect", {}, { headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await request("/connect", {}, { headers: { Authorization: "Bearer invalid" } })).status, 401);
    const wrongHost = await new Promise((resolve, reject) => {
      const req = httpRequest(info.bridgeUrl + "/connect", { method: "POST", headers: { Origin: "http://localhost:3000", Host: "evil.example" } }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on("error", reject); req.end("{}");
    });
    assert.equal(wrongHost, 403);
    assert.equal((await request("/connect", {})).status, 200);
    assert.equal((await request("/connect", { clientId: "another-test-123" })).status, 409);
    const resultPromise = call(client, "list_resumes");
    let task;
    for (let attempt = 0; attempt < 40 && !task; attempt++) { task = await (await request("/poll", {})).json(); if (!task) await new Promise((resolve) => setTimeout(resolve, 10)); }
    assert.equal(task.name, "list_resumes");
    assert.equal(await (await request("/poll", {})).json(), null);
    assert.equal((await request("/result", { id: "wrong-task", result: [] })).status, 404);
    await request("/result", { id: task.id, result: [{ id: "r1", title: "测试" }] });
    assert.deepEqual(data(await resultPromise), [{ id: "r1", title: "测试" }]);
    const pending = call(client, "list_resumes");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await request("/disconnect", {});
    assert.equal((await pending).result.isError, true);
  } finally { client.close(); }
});

test("桥接端口已占用时自动选择空闲端口", async () => {
  const first = start(); let second;
  try {
    const one = data(await call(first, "get_connection_info"));
    second = start(new URL(one.bridgeUrl).port);
    const two = data(await call(second, "get_connection_info"));
    assert.notEqual(one.bridgeUrl, two.bridgeUrl);
  } finally { first.close(); second?.close(); }
});

test("工具schema拒绝越界缩进、非数字字号和额外字段", () => {
  const schema = tools.find((tool) => tool.name === "format_rich_text").inputSchema;
  const base = { resumeId: "r1", expectedUpdatedAt: "version", section: "skills" };
  assert.throws(() => validate({ ...base, indent: 9 }, schema));
  assert.throws(() => validate({ ...base, fontSize: "16" }, schema));
  assert.throws(() => validate({ ...base, eval: "code" }, schema));
  assert.doesNotThrow(() => validate({ ...base, indent: 2, fontSize: 16 }, schema));
});
