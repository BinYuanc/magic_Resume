/**
 * 确保 TanStack Start 生成的路由树存在。
 * `src/routeTree.gen.ts` 被 .gitignore 忽略、由 vite 插件在 dev/build 时生成，
 * 因此「新克隆 + pnpm typecheck」会因为没有这个文件而报一堆路由类型错误。
 * 这里用一次最小化的 vite 服务初始化触发插件生成，不产出任何构建产物。
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const routeTree = fileURLToPath(new URL("../src/routeTree.gen.ts", import.meta.url));

if (!existsSync(routeTree)) {
  const server = await createServer({
    root,
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    logLevel: "error",
  });
  await server.close();
}

if (!existsSync(routeTree)) {
  console.error("未能生成 src/routeTree.gen.ts：请先运行 pnpm dev 或 pnpm build 再执行类型检查。");
  process.exitCode = 1;
} else {
  console.log("routeTree.gen.ts 已就绪");
}
