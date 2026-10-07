import test from "node:test";
import assert from "node:assert/strict";
import {
  installationArgs,
  installationConfig,
  genericServerConfig,
  genericClientConfig,
  genericClientConfigJson,
} from "../scripts/setup-mcp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

test("MCP 安装计算当前项目路径，支持空格与不同工作目录",()=>{
  const script=resolve("example project with spaces/scripts/setup-mcp.mjs");
  const url=pathToFileURL(script).href;
  const nodePath="custom node executable";
  const args=installationArgs(url,nodePath);

  assert.equal(args[4],nodePath);
  assert.equal(args[5],resolve("example project with spaces/mcp/server.mjs"));

  const config=installationConfig(args);
  assert.ok(config.includes(JSON.stringify(args[5])));
  assert.ok(!config.includes("D:\\FileInstalled"));

  const server=genericServerConfig(url,nodePath);
  assert.deepEqual(server,{command:nodePath,args:[args[5]]});

  const client=genericClientConfig(url,nodePath);
  assert.deepEqual(client,{mcpServers:{"magic-resume":server}});

  const json=JSON.parse(genericClientConfigJson(url,nodePath));
  assert.deepEqual(json,client);
});

test("通用 MCP 配置只包含启动 Server 必需信息，不绑定模型或客户端",()=>{
  const script=pathToFileURL(resolve("portable/scripts/setup-mcp.mjs")).href;
  const config=genericClientConfig(script,"node-custom");
  const serialized=JSON.stringify(config);

  assert.equal(config.mcpServers["magic-resume"].command,"node-custom");
  assert.equal(config.mcpServers["magic-resume"].args.length,1);
  assert.match(config.mcpServers["magic-resume"].args[0],/mcp[\\/]server\.mjs$/);
  for (const vendor of ["codex","deepseek","gemini","doubao","claude","qwen","openai"]) {
    assert.equal(serialized.toLowerCase().includes(vendor),false);
  }
});
