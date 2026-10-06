# 魔方简历 · 本地 Codex MCP 接入

本地版 v1：Codex 可直接读取和修改简历、设置正文缩进和字号、创建或更新可复用模板。截图发给 Codex，由 Codex 识别展示风格，再通过 MCP 创建模板；服务本身不识别图片，也不调用收费模型 API。

## 安装与启动

需要 Node.js 20 或更新版本。无需安装额外 npm 依赖。先启动魔方简历（默认 localhost:3000），再注册 MCP：

在项目根目录执行（支持项目移动、空格目录和 Node 不在 PATH）：

```powershell
node scripts/setup-mcp.mjs
# 或 pnpm mcp:install
```

脚本通过 import.meta.url 计算当前 server.mjs 的绝对路径，使用当前 Node 可执行文件注册到 Codex。项目移动后重新运行即可。无需手动修改路径。

没有 codex 命令时，运行 `node scripts/setup-mcp.mjs --print` 生成配置，再添加到 Codex MCP 设置或 config.toml；不会覆盖其他服务。可用 `--codex <codex.exe完整路径>` 指定 CLI。安装成功后重启 Codex / 新建会话，再获取配对码。MCP 服务由 Codex 启动。

## 配对网页

1. 对 Codex 说：“调用 magic-resume 的 get_connection_info，返回桥接地址和配对码。”
2. 打开魔方简历首页，点击 **MCP 接入说明**。
3. 填入返回的桥接地址与配对码，点击 **连接 Codex**。
4. 出现“Codex 已连接”后，保持网页打开。可以在同一标签页进入工作台或模板库。

配对信息仅存当前标签页的 sessionStorage。服务重启会更换配对码；刷新网页可以恢复同一服务的连接。端口默认 43127，占用时自动使用其他空闲端口，以 get_connection_info 返回值为准。一次只接入一个网页，避免不同浏览器简历库混用。断开按钮位于网页左下角。

## 示例指令

- 读取我的简历，按 AI 应用开发岗位优化文字，保留真实经历，不编造指标。
- 把第一条工作经历的职责左缩进2字符、字号改为16px，保留加粗和列表。
- 附截图：先读取模板 schema，把参考图的单/双栏、基本信息对齐、色彩、字体、字号、分隔线与间距提取成新模板；不要复制截图中的个人信息。创建后应用到我的简历，使用模板默认排版。
- 把当前排版保存为名叫“蓝色技术”的模板。
- 撤销最近一次简历修改。

## 工具清单

| 工具 | 功能 |
| --- | --- |
| get_connection_info | 本地桥接地址、配对码、连接状态 |
| list_resumes / get_resume | 简历列表、内容与版本 |
| create_resume / update_resume | 创建空白简历、修改指定内容字段 |
| set_resume_style | 字体、字号、颜色、边距、行距、间距 |
| format_rich_text | 单个正文的缩进、字号、对齐 |
| apply_template | 应用模板；可保留排版或使用模板默认 |
| undo_resume_change / redo_resume_change | 撤销与重做 |
| mutate_resume_item | 条目新增/修改/删除/上下移动，无需替换整个数组 |
| manage_body_sections | 正文块读取/新增/标题和正文修改/删除/上下移动/同行 |
| set_section_style / set_item_style | 模块标题/间距与条目正文、项目名称/角色样式 |
| get_effective_style | 最终生效样式 |
| inspect_layout | 已打开工作台的实际页数、模块高度与溢出 |
| list_templates / get_template_schema | 模板列表及展示参数说明 |
| create_template / update_template | 创建/更新“我的模板” |
| save_resume_as_template | 当前展示样式保存为模板 |

写入现有简历前，读取 get_resume 的 updatedAt，作为 expectedUpdatedAt 传入。版本不同会拒绝覆盖，需重新读取并合并。正文条目通过 itemId 定位；数组更新为整体替换，须保留未修改条目。basic 仅允许基本文本字段局部合并。图标、图片配置等复杂数据在网页调整。模板内容走已有 Schema 安全/隐私检查；简历 HTML 走格式白名单。没有删除简历工具。

## 模板支持范围

单栏/双栏；模块顺序；主栏/侧栏分配与比例；姓名信息左/中/右对齐；字体、正文与标题字号；行距；页边距；纯色；模块标题字重、对齐与水平分隔线；模块背景；模块和条目间距。

创建后即可在模板库“我的模板”找到，跨简历复用。任意图形、特殊字形、渐变、复杂表格与不规则布局不能保证逐像素复刻。让 Codex 先说明无法表达的部分，再选择最接近的可用参数。截图中的信息只用于理解展示风格，不复制为模板内容。双栏 DOCX 使用简化线性布局，网页/PDF保留两栏。

## 工作原理与边界

```text
Codex --MCP stdio--> 本地 Node 服务
                         ↕ 配对码认证 + 操作队列
                 已连接网页的业务操作
                         ↓
              Zustand → localStorage / 现有文件同步
                         ↓
                    工作台预览、模板库
```

服务仅监听 127.0.0.1，校验 Host、网页 Origin 和随机配对码。没有公网服务；不读取任意文件，不执行模型生成的代码。只通过用户配对的网页操作当前浏览器数据；服务不单独存储简历库。浏览器关闭或休眠后工具不可用，需重新连接；隐藏标签页可能被浏览器节流，尽量保持页面可见。写入超时可能已执行，先读取核实，不能盲目重试。配对码不要提交到 Git、放进截图或分享文档。

自定义网页地址时配置 `MAGIC_RESUME_ORIGINS`（逗号分隔精确 Origin），例如 `http://localhost:3001,http://127.0.0.1:3001`；可选 `MAGIC_RESUME_BRIDGE_PORT` 指定桥接端口。浏览器的本地网络访问权限提示需允许，HTTPS 网页到 HTTP 本地桥可能受浏览器限制，本地版使用 HTTP localhost 页面。

网页版 ChatGPT 的远程接入不在此版本中。Codex 配置参考：https://learn.chatgpt.com/docs/extend/mcp?surface=cli

## 精细编辑与重试

`manage_body_sections(action="list")` 返回稳定块 id。写入使用 bodySectionId；list 无需 expectedUpdatedAt。例如“把 BizAgent 的项目定位移到核心负责下面，并设为同行”，先 get_resume 定位项目 itemId，再 list 定位块，逐步使用最新返回的版本。

所有写工具支持可选 idempotencyKey。重试必须保持首次工具与所有参数完全相同（包含首次 expectedUpdatedAt）。同键返回首次结果；不同参数复用同键会拒绝。幂等记录在当前网页标签会话保留24小时、最多100条，跨桥接重连与网页刷新有效；不是跨设备永久记录。未确认的 pending 不重复执行，先读取核实。

inspect_layout 需要目标简历工作台已打开、字体加载完成；否则明确返回不可测量。结果描述Web预览，不替代Word分页。请先调整间距和布局，不应为了强行一页自动把正文降到不易阅读的字号。

升级后重启 Codex/新建聊天重新加载21个工具，并重新获取配对码。导出工具和模板删除/复制/导出生命周期暂不纳入此轮。
