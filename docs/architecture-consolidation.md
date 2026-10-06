# 样式、正文块与 MCP 收口

## 数据边界与迁移

ResumeData 的 styleOverrides 是用户全局/模块/条目样式的唯一存储来源。globalSettings 保留图标、分页、标题居中等产品开关；旧字号/字体/色彩/间距仅作为迁移来源。

`useResumeStore` 在 localStorage 合并、JSON/文件导入、新建和更新入口调用幂等迁移。显式 override 优先，不改变个人文字和读取时的 updatedAt。旧 updateGlobalSettings API 和外部旧 globalSettings patch 经过 settingsPatch 转译。UI/PDF 的旧读取经 readResumeSettings 投影，投影不写回存储。切换模板默认清除覆盖；保留排版选项保留覆盖；撤销与重做都保留自定义模板 ID。

正文块 v1 使用 Tiptap resumeSectionHeading Node，HTML 为 `h3[data-resume-section="1"]`，包含稳定 data-section-id 和可选 data-body-inline。首次读取无 bodySectionsVersion 的存量简历迁移旧 H3；历史 H3 原本已混用，无法还原其原始意图。迁移后普通 H3、粘贴与 AI 返回的普通 H3 不分块。外部粘贴移除语义标记；MCP 编辑可以明确保留或使用 manage_body_sections 创建块。标题内容仍可自定义。

## MCP

共21个工具，增加 mutate_resume_item、manage_body_sections、set_section_style、set_item_style、get_effective_style、inspect_layout、redo_resume_change。所有现有认证/来源检查保留。现有简历的精细写操作继续要求 expectedUpdatedAt；list 正文块无需版本。版本时间戳单调递增。

可选 idempotencyKey 在浏览器业务端记录（同一标签会话，24小时、最多100条），保留 pending -> done/failed 结果。重复请求在版本检查前返回首次结果，不再修改数据或产生重复历史；同键不同工具/参数拒绝。预写失败不执行；刷新遇到 pending 拒绝重做并要求读回核实。完成结果保存失败时仍保留 pending，避免误重放。服务重启后重连同一网页会话仍有效；新标签/存储清除后不提供跨会话幂等。

inspect_layout 仅测量已打开的目标工作台。等待字体加载，忽略外层响应式预览缩放，保留自动一页的 CSS zoom。返回实际内容高度、页数、横向溢出与模块高度；该值描述 Web，不承诺 Word 分页相同。

## Word

经典与极简提供完整的可编辑单栏布局映射：页头照片/姓名/联系方式分栏，姓名30px、岗位18px，条目名称/副标题/日期三栏，模块标题与分隔线、局部字号、分块标题、列表、超链接与图片。采用无边框固定宽度 Word 表格，不使用整页截图。表格单元格合法结束段落，关系递归收集；标题 keepNext 防止孤立。

full 指已支持的结构映射，不承诺不同 Office 排版引擎像素一致。图标、GitHub贡献图、自由头部布局和圆角照片属于装饰差异：仍按完整布局导出，并通过 `decorationsOmitted` 单独提示；`simplified` 只表示「使用了简化布局」，不再把默认开启图标误判成简化。其余复杂模板保持 basic。字体需 Word/WPS 本机安装，字体映射与半磅取整可能影响换行。导出文件已用 LibreOffice 打开验证：经典模板的并排页头、三栏条目、分块同行标题与编号列表均可编辑呈现，可打印结果无表格边框（表格边界仅为编辑视图装饰）。Word/WPS 原生打开的像素级视觉回归仍需本机复核。

## CI 与本地构建

GitHub Actions 对 push/PR 执行 frozen-lockfile 安装、typecheck、test:templates、test:mcp、build。typecheck 用 tsconfig.app.json 检查当前 TanStack/Vite 代码（包括 src/app 中实际使用的页面），仅列出排除未使用的旧 Next 路由/API/布局入口。没有过滤诊断或关闭 strict。

Windows pnpm 硬链接可能继承 Low 完整性标签，导致 esbuild 无法删除 Node 临时文件。build-local.mjs 使用安装包同版本二进制的数据副本，不修改系统权限/依赖文件；Linux直接运行Vite。可直接 pnpm build 或 node scripts/build-local.mjs。

回滚数据迁移前应备份原 JSON/localStorage；旧版本编辑器不认识新正文块的独立 Node。当前旧渲染器仍认识标准 H3 输出，兼容预览与导出。
