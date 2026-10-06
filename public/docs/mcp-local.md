# 魔方简历 · 本地 MCP 接入

Magic Resume 提供一个 **模型无关的本地 MCP Server**。

它不绑定 Codex，也不绑定 DeepSeek、豆包、Gemini、Claude、Qwen、OpenAI。真正决定能否“直接接入”的，是你使用的 **AI 客户端 / Agent Host 是否支持本地 stdio MCP**。

## 一句话理解

```text
任意支持 MCP 的 AI Host
        │
        │ stdio MCP
        ▼
Magic Resume MCP Server
        │
        │ 配对码 + 本地桥接
        ▼
已打开的 Magic Resume 网页
        │
        ▼
简历 / 模板 / 排版 / Undo / Layout 检测
```

同一个 MCP Server 暴露同一套简历工具，不需要为不同模型维护多份业务代码。

---

## 支持方式

### 方式 A：客户端原生支持本地 stdio MCP

这是最简单的方式。

你的客户端只需要能够配置：

```json
{
  "command": "node",
  "args": ["<项目绝对路径>/mcp/server.mjs"]
}
```

模型品牌不重要。Host 可以使用任何它自己支持的模型。

### 方式 B：只有模型 API，没有 MCP Host

如果你只是直接调用：

- DeepSeek API
- Gemini API
- 豆包 API
- OpenAI API
- Claude API
- Qwen API

那么模型 API 本身通常不会替你启动本地 MCP Server。

这时需要你自己的 Agent Runtime：

```text
模型 API
  │
  │ Function / Tool Calling
  ▼
你的 Agent Runtime
  │
  │ MCP tools/call
  ▼
Magic Resume MCP Server
```

这仍然复用同一套 Magic Resume MCP 工具。

---

## 安装与启动

需要 Node.js 20 或更新版本。MCP Server 本身不需要额外 npm 依赖。

先启动 Magic Resume（默认 `http://localhost:3000`）。

### Codex 快捷安装

在项目根目录执行：

```powershell
node scripts/setup-mcp.mjs
# 或
pnpm mcp:install
```

脚本通过 `import.meta.url` 自动计算当前项目 `mcp/server.mjs` 的绝对路径，不再写死本机目录。

如需 Codex TOML 配置：

```powershell
node scripts/setup-mcp.mjs --print
```

### 通用 MCP Host JSON

运行：

```powershell
node scripts/setup-mcp.mjs --print-json
```

输出类似：

```json
{
  "mcpServers": {
    "magic-resume": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "D:\\path\\to\\magic_Resume\\mcp\\server.mjs"
      ]
    }
  }
}
```

不同 MCP Host 的根配置键可能不同，例如有的叫 `mcpServers`，有的叫其他名称。

**真正通用的是：**

```text
command
args
```

### 只输出 Server 启动信息

如果你的 Host 使用自己的配置格式：

```powershell
node scripts/setup-mcp.mjs --print-server
```

输出：

```json
{
  "command": "...node...",
  "args": [".../mcp/server.mjs"]
}
```

然后按照你的 MCP Host 文档粘贴即可。

---

## 配对网页

MCP Host 启动 Magic Resume MCP Server 后：

1. 在当前 MCP 客户端中调用 `magic-resume.get_connection_info`。
2. 工具会返回：
   - `bridgeUrl`
   - `pairingCode`
   - `pageUrl`
3. 打开 Magic Resume。
4. 点击 **MCP 接入说明**。
5. 填入桥接地址和配对码。
6. 点击 **连接 MCP 客户端**。
7. 保持网页打开。

每次 MCP Server 重启都会生成新的配对码。

默认桥接端口是 `43127`；如果被占用，会自动选择其他空闲端口，以 `get_connection_info` 返回值为准。

一次只允许一个网页连接该 Server，避免不同浏览器里的简历库串线。

---

## 模型无关是什么意思

下面几种情况使用的是 **同一个 Magic Resume MCP Server**：

```text
Codex + GPT
Claude / 其他 MCP Host + Claude
自定义 Agent Host + DeepSeek
自定义 Agent Host + Gemini
自定义 Agent Host + 豆包
自定义 Agent Host + Qwen
自定义 Agent Host + OpenAI
```

Magic Resume MCP 不关心背后是什么模型。

它只接收标准 MCP 调用：

```text
initialize
tools/list
tools/call
```

因此换模型时，不需要重写简历业务逻辑。

---

## 工具清单

当前共有 21 个工具。

| 工具 | 功能 |
| --- | --- |
| get_connection_info | 本地桥接地址、配对码、连接状态 |
| list_resumes | 简历列表 |
| get_resume | 完整简历与 updatedAt |
| create_resume | 创建空白简历 |
| update_resume | 修改简历内容字段 |
| mutate_resume_item | 单条项目 / 工作 / 教育 / 自定义条目增删改移动 |
| manage_body_sections | 正文块读取、新增、修改、删除、移动、同行 |
| set_resume_style | 全局字体、字号、颜色、边距、行距、间距 |
| set_section_style | 模块标题与模块间距样式 |
| set_item_style | 条目正文、项目名称 / 角色局部样式 |
| format_rich_text | 单个正文缩进、字号、对齐 |
| get_effective_style | 读取最终生效样式 |
| inspect_layout | 真实工作台页数、溢出、模块高度 |
| list_templates | 内置与用户模板 |
| get_template_schema | 自定义模板 Schema 能力说明 |
| create_template | 创建自定义模板 |
| update_template | 更新自定义模板 |
| apply_template | 应用模板 |
| save_resume_as_template | 当前排版保存为模板 |
| undo_resume_change | 撤销 |
| redo_resume_change | 重做 |

---

## 精细修改示例

### 只修改某一个项目

先：

```text
list_resumes
→ get_resume
```

定位项目 `itemId` 后：

```text
mutate_resume_item
```

不需要把整个 `projects[]` 重新提交。

### 调整正文块

```text
manage_body_sections(action="list")
```

拿到稳定的 `bodySectionId` 后，可执行：

```text
add
update_title
update_content
move_up
move_down
delete
set_inline
```

普通 H3 不会被误识别成正文块。

### 检查是否超过一页

打开对应简历工作台后：

```text
inspect_layout
```

会读取真实 DOM，返回：

- pageCount
- overflowPx
- 模块高度
- 横向溢出

它测量的是 Web 预览，不等同于 Word 分页。

---

## 写操作安全规则

写入现有简历前：

```text
get_resume
↓
读取 updatedAt
↓
作为 expectedUpdatedAt 写回
```

如果用户已经在网页中修改了简历，版本不同会拒绝覆盖。

所有写工具还支持可选：

```text
idempotencyKey
```

相同 key + 相同参数重试，会直接返回首次结果。

相同 key + 不同参数，会拒绝。

这样可以避免请求超时后重复创建条目或模板。

---

## 模板边界

MCP 模板支持：

- 单栏 / 双栏
- 模块顺序
- 主栏 / 侧栏分配
- 栏宽比例
- BasicInfo 左 / 中 / 右
- 字体
- 正文 / 标题 / 副标题字号
- 行距
- 页面边距
- 主题色
- 模块标题字号 / 字重 / 颜色
- 对齐
- 分隔线
- 模块背景
- 模块间距
- 条目间距

以下内容不能保证逐像素复刻：

- 任意自由图形
- 渐变装饰
- 多层复杂表格
- 特殊字体
- PPT / Canva 式绝对定位

截图中的姓名、电话、工作经历等只能用来理解排版，不允许写入模板。

---

## 安全边界

本地桥：

- 只监听 `127.0.0.1`
- 校验 Host
- 校验网页 Origin
- 使用随机 48 位配对码
- 一次只连接一个网页
- 不执行模型生成的 JavaScript
- 不读取任意本地文件
- MCP Server 不单独持久化简历库

简历仍由当前 Magic Resume 网页中的 Zustand / LocalStorage / 文件同步体系管理。

配对码不要：

- 提交 Git
- 放进截图
- 放进共享文档
- 发给不可信程序

---

## 环境变量

自定义网页 Origin：

```powershell
MAGIC_RESUME_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
```

指定桥接端口：

```powershell
MAGIC_RESUME_BRIDGE_PORT=43127
```

如果端口占用，默认逻辑会自动回退到空闲端口。

---

## 常见问题

### 为什么我配置了 DeepSeek API，却不能直接“连接 MCP”？

因为：

```text
模型 API ≠ MCP Host
```

需要一个支持 MCP 的客户端，或者你自己的 Agent Runtime 负责 MCP 调用。

### Magic Resume MCP 是否只能给 Codex 用？

不是。

Codex 只是目前提供一键注册脚本的客户端。

`--print-json` 和 `--print-server` 用于其他 MCP Host。

### 不同模型需要重新开发工具吗？

不需要。

它们都使用同一套 21 个 MCP Tool。

### 网页版 AI 产品都能接吗？

不一定。

远程网页产品能否访问本机 stdio MCP Server，取决于该产品自己的 MCP / Connector 能力。

Magic Resume 不会假设所有模型网页都可以直接访问本机 MCP。

---

## 验证建议

升级后至少执行：

```powershell
pnpm test:mcp
pnpm typecheck
pnpm build
```

然后分别验证：

1. Codex 快捷安装仍然可用。
2. `--print` 输出 TOML。
3. `--print-json` 输出 JSON Host 配置。
4. `--print-server` 输出纯 command + args。
5. MCP 客户端可以 `tools/list` 获取 21 个工具。
6. `get_connection_info` 可以完成网页配对。
7. 不同 Host 使用同一 Server 时工具行为一致。
