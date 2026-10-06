import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/** 解析当前项目里的 MCP Server 启动信息，供不同 MCP Host 共用。 */
export function serverDescriptor(scriptUrl = import.meta.url, nodePath = process.execPath) {
  const server = fileURLToPath(new URL("../mcp/server.mjs", scriptUrl));
  return { command: nodePath, args: [server] };
}

/** Codex CLI 的快捷安装参数；保留旧行为，避免已有用户升级后失效。 */
export function installationArgs(scriptUrl = import.meta.url, nodePath = process.execPath) {
  const server = serverDescriptor(scriptUrl, nodePath);
  return ["mcp", "add", "magic-resume", "--", server.command, server.args[0]];
}

/** Codex config.toml 片段。 */
export function installationConfig(args) {
  // TOML 字符串使用 JSON 的安全引号/转义，支持空格和 Windows 反斜杠。
  return `[mcp_servers.magic-resume]\ncommand = ${JSON.stringify(args[4])}\nargs = [${JSON.stringify(args[5])}]\nstartup_timeout_sec = 10\ntool_timeout_sec = 60`;
}

/** 只输出 server 本身，适合字段名不同的通用 MCP Host 手动粘贴。 */
export function genericServerConfig(scriptUrl = import.meta.url, nodePath = process.execPath) {
  return serverDescriptor(scriptUrl, nodePath);
}

/**
 * 常见 JSON 风格 MCP Host 配置。
 * 注意：MCP Host 的根键命名可能不同；真正通用的是内部的 command + args。
 */
export function genericClientConfig(scriptUrl = import.meta.url, nodePath = process.execPath) {
  return {
    mcpServers: {
      "magic-resume": genericServerConfig(scriptUrl, nodePath),
    },
  };
}

export function genericClientConfigJson(scriptUrl = import.meta.url, nodePath = process.execPath) {
  return JSON.stringify(genericClientConfig(scriptUrl, nodePath), null, 2);
}

function printHelp() {
  console.log(`Magic Resume MCP 配置工具

用法：
  node scripts/setup-mcp.mjs               # Codex 快捷安装（兼容旧行为）
  node scripts/setup-mcp.mjs --print       # 输出 Codex config.toml 片段
  node scripts/setup-mcp.mjs --print-json  # 输出常见 JSON 风格 MCP Host 配置
  node scripts/setup-mcp.mjs --print-server# 只输出通用 command + args
  node scripts/setup-mcp.mjs --codex <path># 指定 Codex CLI 可执行文件
  node scripts/setup-mcp.mjs --help

说明：
  MCP Server 与具体模型无关。Codex 只是快捷安装示例。
  DeepSeek / Gemini / 豆包 / Claude / Qwen / OpenAI 等模型，
  只要运行在支持本地 stdio MCP 的 Host 中，或由 Agent Runtime 转接 MCP，
  都可以使用同一套 Magic Resume 工具。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = installationArgs();
  const descriptor = serverDescriptor();
  if (!existsSync(descriptor.args[0])) throw new Error("找不到 mcp/server.mjs，请保留项目目录结构");

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
  } else if (process.argv.includes("--print-json")) {
    console.log(genericClientConfigJson());
  } else if (process.argv.includes("--print-server")) {
    console.log(JSON.stringify(genericServerConfig(), null, 2));
  } else if (process.argv.includes("--print")) {
    console.log(installationConfig(args));
  } else {
    const option = process.argv.indexOf("--codex");
    const binary = option >= 0 ? process.argv[option + 1] : "codex";
    if (!binary) throw new Error("--codex 需要 Codex CLI 可执行文件路径");
    const result = spawnSync(binary, args, { stdio: "inherit", shell: false });
    if (result.error) {
      console.error("无法执行 Codex CLI：", result.error.message);
      console.error("Codex 用户可运行 node scripts/setup-mcp.mjs --print；其他 MCP Host 可运行 --print-json 或 --print-server 获取通用配置。");
      process.exitCode = 1;
    } else {
      process.exitCode = result.status ?? 1;
      if (result.status === 0) console.log("已注册当前项目。重启 Codex 或新建聊天后获取配对码。项目移动后重新运行此脚本即可。");
    }
  }
}
