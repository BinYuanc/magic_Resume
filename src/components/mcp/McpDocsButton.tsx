import { useState } from "react";
import { BookOpen, Copy, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMcpBridge } from "./McpBridge";
import { toast } from "sonner";

const codexInstallCommand = "node scripts/setup-mcp.mjs";
const codexConfigCommand = "node scripts/setup-mcp.mjs --print";
const genericJsonCommand = "node scripts/setup-mcp.mjs --print-json";
const genericServerCommand = "node scripts/setup-mcp.mjs --print-server";

export function McpDocsButton() {
  const [url, setUrl] = useState("http://127.0.0.1:43127");
  const [token, setToken] = useState("");
  const status = useMcpBridge((state) => state.status);
  const connected = useMcpBridge((state) => state.connected);
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success("已复制"); } catch { toast.error("复制失败，请手动选择复制"); } };

  return <Dialog>
    <DialogTrigger asChild><Button variant="outline" className="gap-2 rounded-xl" aria-label="MCP 接入说明"><BookOpen className="h-4 w-4" />MCP 接入说明</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>通过 MCP 使用 AI 编辑魔方简历</DialogTitle>
        <DialogDescription>模型无关：任何支持本地 stdio MCP 的客户端都可使用同一套简历工具</DialogDescription>
      </DialogHeader>

      <div className="space-y-5 text-sm leading-6">
        <p>
          Magic Resume MCP Server 不绑定 Codex、DeepSeek、豆包、Gemini、Claude、Qwen 或 OpenAI。
          真正决定能否直接接入的是你使用的 AI 客户端 / Agent Host 是否支持本地 stdio MCP。
          Codex 只是已经提供快捷安装的一种客户端。
        </p>

        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold">1. 选择你的 MCP 客户端</h3>

          <details open>
            <summary className="cursor-pointer font-medium">Codex（快捷安装）</summary>
            <p className="mt-2">在项目根目录执行，脚本会自动计算当前 Node 和 mcp/server.mjs 的绝对路径：</p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{codexInstallCommand}</pre>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void copy(codexInstallCommand)}><Copy className="mr-2 h-3 w-3" />复制安装命令</Button>
              <Button size="sm" variant="outline" onClick={() => void copy(codexConfigCommand)}>复制 TOML 生成命令</Button>
            </div>
          </details>

          <details>
            <summary className="cursor-pointer font-medium">通用 MCP Host（JSON 配置）</summary>
            <p className="mt-2">
              适用于采用 command + args 的本地 stdio MCP Host。不同客户端的根配置键可能不同，
              但 Server 的 command / args 完全相同。
            </p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{genericJsonCommand}</pre>
            <Button size="sm" variant="outline" onClick={() => void copy(genericJsonCommand)}><Copy className="mr-2 h-3 w-3" />复制 JSON 生成命令</Button>
          </details>

          <details>
            <summary className="cursor-pointer font-medium">只获取通用 Server 启动信息</summary>
            <p className="mt-2">
              如果你的 MCP Host 使用自定义配置格式，运行下面命令，只取当前机器对应的 command 和 args。
            </p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{genericServerCommand}</pre>
            <Button size="sm" variant="outline" onClick={() => void copy(genericServerCommand)}><Copy className="mr-2 h-3 w-3" />复制命令</Button>
          </details>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold">2. 配对此网页</h3>
          <p>
            在你的 MCP 客户端中调用 <code>magic-resume.get_connection_info</code>，取得桥接地址与配对码，
            然后填到下面。每次 MCP Server 重启都会生成新的配对码。
          </p>
          <label className="block">桥接地址<Input aria-label="MCP 桥接地址" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
          <label className="block">配对码<Input aria-label="MCP 配对码" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
          <div className="flex flex-wrap gap-3 items-center">
            <Button onClick={() => { try { useMcpBridge.getState().connect({ url, token }); setToken(""); } catch (error) { toast.error(error instanceof Error ? error.message : "连接失败"); } }}>
              <Plug className="mr-2 h-4 w-4" />连接 MCP 客户端
            </Button>
            <span role="status" className={connected ? "text-green-600" : "text-muted-foreground"}>{status}</span>
          </div>
          <p className="text-muted-foreground">
            需要保持此网页打开，可以切换到工作台。连接的是此浏览器的简历库；一次只连接一个网页。
            配对信息只保存在此标签页会话中；点击左下角“断开 MCP”即可停止访问。
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">3. 模型如何使用这套工具</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>如果客户端原生支持 MCP：模型会直接看到 Magic Resume 的 21 个工具，与模型品牌无关。</li>
            <li>如果你只有 DeepSeek / Gemini / 豆包等模型 API：需要由你自己的 Agent Runtime 把模型的 Tool Calling 转接到 MCP。</li>
            <li>同一套 MCP Server 不需要为每个模型维护一份业务代码。</li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold">4. 示例指令</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>“读取我的简历，把 AI 应用开发经历改得更清晰，保留真实事实，不添加虚构业绩。”</li>
            <li>“把第一段工作职责缩进 2 字符，正文改为 16px，保留现有加粗和列表。”</li>
            <li>“检查当前是否超过一页，优先调小间距，不要直接把正文字号降到 12px 以下。”</li>
            <li>“把当前排版保存为模板，名称叫蓝色技术简历。”</li>
          </ul>
        </div>

        <p className="text-muted-foreground">
          模板支持单栏/双栏、模块顺序与栏位、字体与字号、纯色背景、标题颜色与分隔线、对齐和间距。
          复杂图形、装饰、多层表格无法保证逐像素复刻。经典与极简 Word 支持更完整的可编辑布局，
          双栏等复杂模板的 Word 可能采用简化布局。
        </p>

        <p className="text-muted-foreground">
          连接失败：确认 MCP Host 已启动本地 stdio Server、重新调用 get_connection_info 获取配对码，
          并使用返回的实际端口。自定义网页端口需要配置 MAGIC_RESUME_ORIGINS。
          远程网页产品能否直接访问本地 stdio MCP，取决于该产品自己的 MCP 支持方式。
        </p>

        <a className="underline" href="/docs/mcp-local.md" target="_blank" rel="noreferrer">打开完整 MCP 接入文档</a>
      </div>
    </DialogContent>
  </Dialog>;
}
