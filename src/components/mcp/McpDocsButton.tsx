import { useState } from "react";
import { BookOpen, Copy, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMcpBridge } from "./McpBridge";
import { toast } from "sonner";

const command = "node scripts/setup-mcp.mjs";
const config = "node scripts/setup-mcp.mjs --print";
export function McpDocsButton() {
  const [url, setUrl] = useState("http://127.0.0.1:43127");
  const [token, setToken] = useState("");
  const status = useMcpBridge((state) => state.status);
  const connected = useMcpBridge((state) => state.connected);
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success("已复制"); } catch { toast.error("复制失败，请手动选择复制"); } };
  return <Dialog>
    <DialogTrigger asChild><Button variant="outline" className="gap-2 rounded-xl" aria-label="MCP 接入说明"><BookOpen className="h-4 w-4" />MCP 接入说明</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>用 Codex 直接编辑魔方简历</DialogTitle><DialogDescription>本地 MCP 配置、网页配对和截图模板使用说明</DialogDescription></DialogHeader>
      <div className="space-y-5 text-sm leading-6">
        <p>连接后，Codex 可以读写简历、调整字号与缩进，并根据你发给它的参考截图创建自定义模板。可按条目和正文块精细编辑、读取最终样式并检查工作台页数。修改同步到网页，可在工作台撤销与重做；模板进入“我的模板”，直接选择即可使用。</p>
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold">1. 在 Codex 中添加本地 MCP</h3>
          <p>保持本地魔方简历运行（默认 localhost:3000）。在项目根目录打开终端，执行以下命令（或 pnpm mcp:install），然后重启 Codex，或重新打开聊天让工具生效：</p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{command}</pre>
          <Button size="sm" variant="outline" onClick={() => void copy(command)}><Copy className="mr-2 h-3 w-3" />复制命令</Button>
          <details><summary className="cursor-pointer">也可以手动添加到 Codex 的 config.toml</summary>
            <p className="mt-2">运行下面的命令生成当前目录对应的配置，再添加到 Codex 的 MCP 设置或 config.toml。脚本自动使用当前 Node 的完整路径；项目移动后重新运行安装命令。</p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{config}</pre>
            <Button size="sm" variant="outline" onClick={() => void copy(config)}>复制生成命令</Button>
          </details>
        </div>
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="font-semibold">2. 配对此网页</h3>
          <p>在 Codex 中说：“调用 magic-resume 的 get_connection_info，给我桥接地址和配对码”。填写后连接。每次 MCP 服务重启都会生成新的配对码。</p>
          <label className="block">桥接地址<Input aria-label="MCP 桥接地址" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
          <label className="block">配对码<Input aria-label="MCP 配对码" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
          <div className="flex flex-wrap gap-3 items-center">
            <Button onClick={() => { try { useMcpBridge.getState().connect({ url, token }); setToken(""); } catch (error) { toast.error(error instanceof Error ? error.message : "连接失败"); } }}><Plug className="mr-2 h-4 w-4" />连接 Codex</Button>
            <span role="status" className={connected ? "text-green-600" : "text-muted-foreground"}>{status}</span>
          </div>
          <p className="text-muted-foreground">需要保持此网页打开，可以切换到工作台。连接的是此浏览器的简历库；一次只连接一个网页。配对信息只保存在此标签页的会话中；点击左下角“断开 MCP”即可停止访问。</p>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold">3. 直接告诉 Codex 你要什么</h3>
          <ul className="list-disc pl-5 space-y-2">
            <li>“读取我的简历，把 AI 应用开发经历改得更清晰，保留真实事实，不添加虚构业绩。”</li>
            <li>“把第一段工作职责缩进 2 字符，正文改为 16px，保留现有加粗和列表。”</li>
            <li>附参考截图：“调用 get_template_schema，提取这张图的栏位、颜色、字号和间距，在我的模板里创建一个新模板，并应用到我的简历；不要复制截图中的个人信息。”</li>
            <li>“把当前排版保存为模板，名称叫蓝色技术简历。”</li>
          </ul>
        </div>
        <p className="text-muted-foreground">模板支持单栏/双栏、模块顺序与栏位、字体与字号、纯色背景、标题颜色与分隔线、对齐和间距。复杂图形、装饰、多层表格无法保证逐像素复刻；可让 Codex 根据预览继续微调。经典与极简 Word 支持可编辑分栏页头和条目；图标、圆角等装饰仍提示简化，双栏 Word 导出为简化布局。</p>
        <p className="text-muted-foreground">连接失败：确认 Codex MCP 已启动、重新获取配对码、使用返回的实际端口（端口占用时会自动更换）。自定义网页端口需要为 MCP 配置 MAGIC_RESUME_ORIGINS。网页版 ChatGPT 接入不属于此本地版。</p>
        <a className="underline" href="/docs/mcp-local.md" target="_blank" rel="noreferrer">打开完整 MCP 接入文档</a>
      </div>
    </DialogContent>
  </Dialog>;
}
