import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export function installationArgs(scriptUrl = import.meta.url, nodePath = process.execPath) {
  const server = fileURLToPath(new URL("../mcp/server.mjs", scriptUrl));
  return ["mcp", "add", "magic-resume", "--", nodePath, server];
}
export function installationConfig(args) {
  // TOML 字符串使用 JSON 的安全引号/转义，支持空格和 Windows 反斜杠。
  return `[mcp_servers.magic-resume]\ncommand = ${JSON.stringify(args[4])}\nargs = [${JSON.stringify(args[5])}]\nstartup_timeout_sec = 10\ntool_timeout_sec = 60`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = installationArgs();
  if (!existsSync(args[5])) throw new Error("找不到 mcp/server.mjs，请保留项目目录结构");
  if (process.argv.includes("--print")) console.log(installationConfig(args));
  else {
    const option = process.argv.indexOf("--codex");
    const binary = option >= 0 ? process.argv[option + 1] : "codex";
    if (!binary) throw new Error("--codex 需要 Codex CLI 可执行文件路径");
    const result = spawnSync(binary, args, { stdio: "inherit", shell: false });
    if (result.error) {
      console.error("无法执行 Codex CLI：", result.error.message);
      console.error("可执行 node scripts/setup-mcp.mjs --print，在 MCP 设置中添加输出配置。Windows 的 npm .cmd 安装请使用 --codex 指定原生 codex.exe。");
      process.exitCode = 1;
    } else {
      process.exitCode = result.status ?? 1;
      if (result.status === 0) console.log("已注册当前项目。重启 Codex 或新建聊天后获取配对码。项目移动后重新运行此脚本即可。");
    }
  }
}
