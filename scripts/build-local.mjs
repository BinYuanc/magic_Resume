import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const root = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env };
let directory, binary;
try {
  if (process.platform === "win32" && !env.ESBUILD_BINARY_PATH) {
    const esbuildRequire = createRequire(viteRequire.resolve("esbuild"));
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const installed = esbuildRequire.resolve(`@esbuild/win32-${arch}/esbuild.exe`);
    directory = mkdtempSync(join(tmpdir(),"magic-resume-build-"));
    binary = join(directory,"esbuild.exe");
    // 复制数据，继承临时目录权限；不改 pnpm 硬链接与系统完整性标签。
    writeFileSync(binary,readFileSync(installed));
    env.ESBUILD_BINARY_PATH = binary;
  }
  const result = spawnSync(process.execPath,[join(dirname(require.resolve("vite/package.json")),"bin","vite.js"),"build"],{ cwd:root,env,stdio:"inherit",shell:false });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  // 只删除此次创建的文件与空目录，不递归删除、不修改第三方安装文件。
  if (binary) try { unlinkSync(binary); } catch { /* 杀毒软件短暂占用时保留临时副本 */ }
  if (directory) try { rmdirSync(directory); } catch { /* 有文件时不强删 */ }
}
