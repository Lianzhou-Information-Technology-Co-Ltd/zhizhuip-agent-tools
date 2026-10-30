# CLAUDE.md

本文件供 Claude Code 和项目贡献者了解构建、测试及维护约定。客户安装和使用请从 [README](README.md) 与 [USAGE](USAGE.md) 开始。

## 项目与命名

仓库为 [zhizhuip-agent-tools](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools)，同仓维护蜘蛛 MCP 与面向客户的 [zhizhuip Skill](skills/zhizhuip/SKILL.md)。npm 包名、启动命令和 MCP 服务标识均为 `zhizhuip-agent-tools`，客户端配置名为 `zhizhuip`，鉴权变量为 `ZHIZHUIP_TOKEN`。

TypeScript、Node.js ≥ 20、官方 MCP SDK v2，仅 stdio。当前 [工具规格](spec/tools.json) 共 44 个工具，21 个标为只读，23 个写工具；`--readonly` 按标注过滤。标注不保证后端零副作用：`main_account_switch_token` 首次读取可能创建 token。业务校验、鉴权和扣费在 PHP 后端；本仓库不直接修改后端。

## 安装与运行入口

- `npm ci`：按锁文件安装，`prepare` 自动构建到 `dist/`。
- `node dist/src/index.js install`：交互选择客户端，一次安装同包 Skill 与 MCP；优先读取环境变量 `ZHIZHUIP_TOKEN`，缺失时交互输入并显示首尾各 4 位，中间遮罩。实际安装先查询只读用户信息接口验证 Key，失败时不写入运行文件、Skill、凭证或客户端配置。仅未提供环境变量 Key 的手动交互输入支持失败后重输；空输入不发送请求，`Ctrl+C` 取消。环境变量 Key 验证失败时即使在交互终端也退出；非交互失败同样以退出码 1 结束，不自动重试。
- `node dist/src/index.js install --agents claude-code,cursor,codex --scope global`：明确客户端与范围；支持 `--readonly`、`--list`、`--dry-run`、`--help`。非交互执行必须指定 `--agents` 并提供环境变量 Key；`--help`、`--list`、`--dry-run` 不读 Key、不发送验证请求。
- `install` 适配 Claude Code、Cursor、Codex、Gemini CLI、OpenCode、经典 Windsurf、Cline 的 VS Code 扩展、VS Code Copilot；Cline 与 Windsurf 仅 global，其余支持 project/global。具体路径见 [USAGE](USAGE.md) 与 [src/install.ts](src/install.ts)。`--list` 只检测相关目录，不证明软件已安装或已加载配置。
- `node dist/src/index.js setup [--readonly] [--npx]`：仅打印 MCP 配置片段，不写配置或安装 Skill。`setup --token ...` 会把 Key 放进命令参数及输出，只供维护者明确需要时使用；通常优先 `install`。
- `setup --npx` 使用 `github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools`。npm 包名与启动命令统一为 `zhizhuip-agent-tools`。
- `node dist/src/index.js [--readonly] [--yes]`：直接启动 MCP。`--yes` 确实会绕过写确认，仅用于明确授权的自动化；安装器不接受或生成 `--yes`，不设置客户端工具自动批准。

直接运行时 API Key 由进程环境 `ZHIZHUIP_TOKEN` 提供。客户端不一定继承当前终端环境，应检查实际子进程配置；不能断言 Key 只能写进客户端配置。`install` 将 Key 保存在用户目录 `~/.zhizhuip-agent-tools/credentials/`，配置只引用凭证文件；固定启动器优先读取环境 Key，否则读取该文件。Inspector 调试可通过其 `-e` 传入环境变量，不在日志或文档保存真实值。

安装后的运行目录位于 `~/.zhizhuip-agent-tools/runtimes/<内容指纹>/`，包含同包产物与生产依赖，不依赖 npx 缓存继续存在。全局安装共享凭证，项目范围按项目路径隔离；更新全局 Key 会影响共享该凭证的既有客户端。变化文件备份，单个客户端失败时恢复自身改动并保留其他成功结果；全部失败时尝试恢复共享凭证，已复制的运行缓存可能保留。TOML 保留配置值但不保证注释、格式不变。POSIX 使用私有权限，Windows 继承用户目录 ACL，不宣称另做 ACL 加固。含符号链接或目录联接的目标会被拒绝。

## 工具、生成器与文档来源

开发链路为文档站 `llms.txt` → [scripts/sync-docs.ts](scripts/sync-docs.ts) → `spec/pages/` 源文档快照 → [scripts/lib/merge.ts](scripts/lib/merge.ts) 与 [spec/overrides.yaml](spec/overrides.yaml) → `spec/tools.json`。当前同步范围为 115 个 `/externalapi/` 页面，跳过 IPAPI `/api/` 页面及已在正式产品分组出现的重复页；实际范围以脚本过滤规则与测试为准。

接口快照保留生成所需的上游接口定义；提交前需将示例中的账号、凭证、联系方式与可识别记录替换为演示值。来源与差异集中说明在 [spec/README.md](spec/README.md)；它们不是当前 MCP 调用说明。工具名称、只读/破坏性标注、产品范围、描述与参数约束的修正在 `spec/overrides.yaml`，不能手改生成的 `spec/tools.json`。`npm run build-spec` 只读本地快照，不联网；`npm run sync-docs` 会联网下载并重建工具规格，运行前确认任务确需同步。

Session 文档单独处理：同步下载保存为 `spec/source/dynamic-proxy-session.md` 待审阅快照，不能直接覆盖维护后的 [spec/dynamic-proxy-session.md](spec/dynamic-proxy-session.md)。运行时 MCP 资源和安装包读取后者。核实 Session、时长和资源池语义后再人工更新运行资源与对应 Skill，避免恢复旧类比、硬编码入口或未经证实的性能承诺。

生成器按产品组合后端参数，工具层使用 `product` 枚举；单产品工具可用固定参数且没有 `product`。子账号 ID 按 schema 用字符串，不能把本地记录 ID 与业务编号混用。动态带宽的 `sub_account_id` 取 `rows[].sub_account`。续费试算、升级差价、订单详情等未暴露能力不能写成可调用工具。

运行期 [src/index.ts](src/index.ts) 注册本地 JSON Schema，SDK 校验参数；[src/http.ts](src/http.ts) 展开产品参数并调用后端，[src/form.ts](src/form.ts) 编码 PHP 表单。按工具标注使用 GET 或 POST，请求带 `is_mcp_send=1`、`User-Agent: zhizhuip mcp` 和 `Accept-Language: zh-CN`。不在运行时拉文档或解析 YAML。

## 写操作确认与业务边界

[src/confirm.ts](src/confirm.ts) 包装默认模式下的写工具。支持表单 elicitation 的客户端可显示预览；只有 `accept` 且 `confirm=true` 才执行。无表单能力或弹窗未获确认时，返回预览与一次性 `confirm_token`。助手必须转述本次完整预览并等待明确同意，拒绝或取消后不得自行执行；工具返回确认码不等于授权。

确认码绑定工具与参数，5 分钟有效，仅使用一次。默认 10 秒静默期只限制过快重试；提前使用会顺延生效时间，时间过去不代表用户已经同意，服务也不能凭时间判断用户是否回复。每次写操作分别确认，参数变化须重新预览；确认码不会传入后端。`ZHIZHUIP_CONFIRM_QUIET_MS=0` 仅用于本地模拟测试，不能用来绕过真实用户确认。

预览从工具说明与参数生成，不实时查价或余额。购买、续费、升级须先核实费用、对象和产品范围；报价工具缺失时使用网站核实结果，不能硬编码价格或绕过 MCP 直调 HTTP。退款申请是待审核，不等于退款到账。超时或断连无法证明写请求未落地，应先复核，不能盲目重试。

`sub_account_update` 改备注以及账密、限流相关更新可能补发默认连接配置；它们不是无风险窄更新。用户要求其他配置不变而 MCP 无法满足时，应解释并停止该写路径。后端语义、前置条件与结果检查见 [工具覆盖表](skills/zhizhuip/references/tool-map.md)。

## Skill 与验证维护

- 客户入口为 `skills/zhizhuip/SKILL.md`，细节放 `references/`，不放本机路径、真实凭证或内部维护记录。
- Skill 以运行中的 MCP schema 为准，不复制整套 schema，不声称覆盖全部后端接口，不绕过 MCP 确认。
- 工具或后端语义变动时同步 [tool-map](skills/zhizhuip/references/tool-map.md)、相关流程、[行为场景](test/evals/scenarios.md)、`test/evals/tool-cases.json` 及对应测试。验收以可执行流程和失败分支为准，不以工具名出现次数计算覆盖率。
- `npm test` 构建并运行全部测试，业务调用使用本地假后端；小范围修改运行相应测试，已通过且未受影响的检查不重复运行。
- 工具规格变化运行 `npm run build-spec` 并核对差异、规格/合同测试；快照只在确认变化合理后更新。
- 安装器只在 `test/install.test.ts` 的隔离 home/project 验证，不改真实客户端配置。新增客户端先核实官方路径、scope 与格式；fixture 通过不等于客户端应用已加载。
- stdio 流程验证在 `test/skill-workflows.test.ts`，覆盖真实本地 SDK 调用与人工维护的假后端预期；不提升为生产支付、代理转发或真实 Agent 行为验收。

## 工作规则与文档

- MCP 运行时 stdout 是协议通道，诊断只用 stderr。Key、密码和确认码不写日志；安装备份可能含旧 Key，不提交或分享。
- 自动化测试仅访问本地假后端。线上验证须明确指定测试账号、范围并取得授权；购买、配置变更和删除等写操作由维护者手动验收。
- 客户端、SDK 和依赖名称可为安装或兼容说明出现；不加入无关公司域名、真实凭据或内部信息。
- 注释使用简明中文、完整标点、参数与实际返回说明；描述与 `@param`、`@return` 等标记空一行。只改文档或注释时不扩展业务修改。
- 只有用户明确要求时提交，默认仅本地提交，不 push。遵循用户的提交范围，已有验证不因提交重跑。
- [README](README.md) 是安装总入口，[USAGE](USAGE.md) 是客户使用说明，[spec/README](spec/README.md) 说明工具定义的来源与维护方式。
- 公开文档只链接仓库或发布包内可读取的文件。内部需求、联调记录、真实响应和未经审阅的下载原文仅保留在本地，不作为安装或构建前置条件。
