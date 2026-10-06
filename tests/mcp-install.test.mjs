import test from "node:test";
import assert from "node:assert/strict";
import { installationArgs,installationConfig } from "../scripts/setup-mcp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
test("MCP 安装计算当前项目路径，支持空格与不同工作目录",()=>{
 const script=resolve("example project with spaces/scripts/setup-mcp.mjs");const args=installationArgs(pathToFileURL(script).href,"custom node executable");assert.equal(args[4],"custom node executable");assert.equal(args[5],resolve("example project with spaces/mcp/server.mjs"));const config=installationConfig(args);assert.ok(config.includes(JSON.stringify(args[5])));assert.ok(!config.includes("D:\\FileInstalled"));
});
