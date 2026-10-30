# zhizhuip-agent-tools

蜘蛛 IP（zhizhuip.com）的 AI 工具，包含 MCP 服务和面向客户的 Agent Skill。让 AI 助手帮助你选择产品、查询账号与用量、生成已有代理连接配置，并在你确认后购买、续费或管理子账号。

- MCP 服务：npm 包名、启动命令和服务标识为 `zhizhuip-agent-tools`，客户端中的配置名为 `zhizhuip`。
- Agent Skill：[skills/zhizhuip/SKILL.md](skills/zhizhuip/SKILL.md)，提供产品选择和操作流程，依赖已连接的蜘蛛 MCP。

完整的客户端配置和使用示例见 [使用指南](USAGE.md)。

默认暴露全部 44 个工具，含下单扣费、续费、删除子账号；加 `--readonly` 只暴露 21 个只读工具。安装本身不会购买产品。23 个写操作执行前都会先向你确认（见下文"写操作确认"）：支持弹窗的客户端由你点确认，其它客户端由助手转述后再向你确认；不需要写操作的人直接配 `--readonly`。

业务逻辑、参数校验、鉴权、扣费全部在后端完成；MCP 负责接口调用，Skill 指导 AI 组织步骤和解释结果。

## 一次安装 Skill 与 MCP

先安装 Node.js 20 或更新版本（自带 npm/npx）和 Git，并准备蜘蛛 IP API Key。以下两种方式任选一种。

**实际安装必须通过 API Key 验证。** 安装器优先读取 `ZHIZHUIP_TOKEN`；未设置时在交互终端输入，显示首尾各 4 位，中间用星号遮住。写入运行文件、Skill、凭证和客户端配置之前，会查询只读用户信息接口验证 Key；无效 Key、网络错误、超时或异常响应都会停止安装，保留已有配置与凭证。非交互执行必须提前设置 `ZHIZHUIP_TOKEN`，并用 `--agents` 指定客户端；`--help`、`--list`、`--dry-run` 不需要 Key，也不发送验证请求。

**方式一：从 GitHub 自动下载并安装。** npx 会获取远程仓库代码、安装依赖并构建，再启动安装器；无需手动克隆或另行运行 `npm ci`：

```bash
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install
```

**方式二：下载源码后安装。** 在终端中进入你希望存放工具的目录，再依次执行：

```bash
git clone https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools.git
cd zhizhuip-agent-tools
npm ci
node dist/src/index.js install
```

`git clone` 下载项目，`cd` 进入源码目录；`npm ci` 按锁文件安装依赖，并自动构建出 `dist/`，最后一条命令安装 Skill 与 MCP。已有本地源码时，进入包含 `package.json` 和 `package-lock.json` 的目录，从 `npm ci` 开始执行。

未指定客户端时会提示选择 Agent；环境变量已有 Key 时不再询问，否则在本机输入并核对首尾字符。默认安装到用户全局范围，所有项目可用。需要显式设置 `ZHIZHUIP_TOKEN` 时，完整的 PowerShell 和 macOS/Linux 示例见[使用指南](USAGE.md#通过环境变量提供必填-api-key)。不要把真实 Key 放在命令参数、Skill 或聊天里。

下面是源码方式的常用参数，在 `zhizhuip-agent-tools` 源码目录执行；GitHub 方式可将 `node dist/src/index.js` 替换为上面的完整 npx 命令（不含末尾的 `install`）：

```bash
# 同时配置三个客户端，也可继续加其他已适配客户端。
node dist/src/index.js install --agents claude-code,cursor,codex
# 查看适配列表与本机相关目录的检测结果。
node dist/src/index.js install --list
# 只预览，不读 Key、不写文件。
node dist/src/index.js install --agents gemini-cli,opencode,vscode --dry-run
# 仅安装查询工具。
node dist/src/index.js install --agents cursor --readonly
```

| Agent ID | 客户端 | 安装范围 |
| --- | --- | --- |
| `claude-code` | Claude Code | global / project |
| `cursor` | Cursor | global / project |
| `codex` | Codex | global / project |
| `gemini-cli` | Gemini CLI | global / project |
| `opencode` | OpenCode | global / project |
| `windsurf` | 经典 Windsurf | global |
| `cline` | Cline 的 VS Code 扩展 | global，默认 VS Code 用户配置 |
| `vscode` | VS Code Copilot | global / project，默认 VS Code 用户配置 |

`--scope project` 指执行命令时的当前目录。只为某个业务项目安装时，先进入该业务项目目录，再运行 GitHub npx 安装命令并加 `--scope project`；使用本地源码时，改用 `node "<工具源码目录的绝对路径>/dist/src/index.js" install --scope project`。不要在工具源码目录中直接指定项目范围，除非要接入的正是这个目录。安装器复制同包 Skill 与 MCP 的生产运行文件到固定位置，统一配置所选客户端；不会依赖之后可能被清理的 npx 缓存。现有其他服务与设置保留，更新前备份，重复运行同一命令可更新或修复；默认保留 MCP 写操作确认，不支持 `install --yes`。客户端原有的停用或信任设置仍需自行核对。

API Key 保存在当前用户的 `~/.zhizhuip-agent-tools/credentials/`，客户端配置只引用凭证文件；启动器优先使用进程中的 `ZHIZHUIP_TOKEN`，没有时从该文件读取并设置此变量后启动 MCP。因此配置中没有明文 token 也仍有鉴权。各项目范围使用独立文件，全局安装共享一个 Key。不要提交或分享该目录及配置备份。POSIX 下设置私有权限，Windows 使用当前用户目录已有 ACL。更新全局 Key 会影响此前使用该全局文件的蜘蛛客户端；既有备份也可能含旧 Key。

完成后重新加载所选客户端，检查 `zhizhuip` Skill 和 MCP 工具。客户端若要求信任项目、启用 Skills 或允许 MCP，按其提示处理。`--list` 仅检测相关目录，不能证明客户端已安装或已加载配置；请在对应客户端中确认连接状态。远程开发、不同 VS Code Profile、Insiders 和其他宿主中的 Cline 不属于该默认路径适配范围；Windsurf 仅适配经典 `.codeium/windsurf` 目录，不覆盖 Devin 的新配置路径。

指定多个客户端的 GitHub 安装命令：

```bash
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install --agents claude-code,cursor,codex
```

需要自行管理工具版本或更新已有安装时，见 [使用指南](USAGE.md#8-本地安装与更新)。

只需要手工配置 MCP 的用户仍可使用下文 `setup`；它只打印片段。只想单独安装 Skill，也可在下载后的工具源码目录执行 `npx skills add . --skill zhizhuip`，但该命令不会配置 MCP，且第三方 Skills CLI 另有 Node.js 版本要求，见其[命令文档](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)。统一安装器本身保持本项目 Node.js 20 基线。

安装后可以提问：

- “使用蜘蛛 IP，帮我选一个适合固定出口的产品，先查价格。”
- “用我已有的美国动态住宅账号生成 20 分钟会话配置，不创建账号。”
- “查询我的蜘蛛账号最近 7 天流量，并列出即将到期的代理。”

Skill 的 [44 个工具覆盖表](skills/zhizhuip/references/tool-map.md) 关联产品、使用前提和结果核对流程；[场景清单](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/test/evals/scenarios.md) 与 [调用样例](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/test/evals/tool-cases.json) 供贡献者检查工具行为。报价或状态查询缺口、后端配置副作用均明确说明，覆盖工具不等于所有业务都能自动闭环。

## 环境要求

Node.js 20 或更新，安装包需提供 npm/npx。统一安装器包含 Windows、macOS、Linux 路径适配；客户端本身支持的系统以其说明为准。从 GitHub 安装还需要 Git，并能访问 GitHub 与 npm；实际安装还需能访问蜘蛛 IP API 完成 Key 验证。

## 获取 token

token 就是网站 API Keys 页面生成的 API Key：

1. 登录蜘蛛 IP 网站，点右上角头像，进 API Keys（手机端在"我的"里）。
2. 新建一个 Key，复制以 `sk-` 开头的完整内容。
3. 统一安装时在终端输入并核对显示的首尾字符，通过验证后才保存；手工配置时填入该服务的 `ZHIZHUIP_TOKEN`。

安装验证提示 Key 无效时，到 API Keys 页面核对或重新生成后，重新执行安装命令。验证失败不会保存新 Key。已安装的 Key 后续被删除时，工具调用也会提示无效；更新 Key 后重载 MCP。Key 等同于账号权限，不要分享给他人或写进客户端代码。

## 仅配置 MCP（手工方式）

已完成统一安装的客户端无需再重复执行本节。只需要 MCP 或使用统一安装器尚未适配的客户端时，选择以下一种方式；Skill 需要另行安装。

### 方式一：由客户端通过 npx 启动

客户端配置里把启动命令写成 `npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools`。客户端第一次拉起时自动从 GitHub 取源码、装依赖、编译并缓存，之后直接复用；启动耗时取决于网络和构建环境。

先打印带占位 Key 的配置片段，在本机编辑后填到对应客户端。`setup` 只打印，不写配置；如显式传 `--token`，该 Key 会出现在输出中。

```bash
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools setup --npx
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools setup --npx --readonly   # 只读版
```

两个最常用的示例。Claude Code：

```bash
claude mcp add -s user -e ZHIZHUIP_TOKEN=YOUR_API_KEY zhizhuip -- npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools
```

Claude Desktop 的 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "zhizhuip": {
      "command": "npx",
      "args": ["-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools"],
      "env": { "ZHIZHUIP_TOKEN": "YOUR_API_KEY" }
    }
  }
}
```

只读版在 `args` 末尾加 `"--readonly"`。Windows 下若客户端报找不到 npx，把 `command` 改成 `cmd`，`args` 最前面加 `"/c", "npx"`。

### 方式二：克隆仓库，本地构建

```bash
git clone https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools.git zhizhuip-agent-tools
cd zhizhuip-agent-tools
npm ci
```

`npm ci` 结束时会自动编译到 `dist/`。启动命令是 `node <安装目录>/dist/src/index.js`，只读加 `--readonly`，自动化脚本加 `--yes` 跳过写操作确认。配置片段同样用 setup 打印：

```bash
node <安装目录>/dist/src/index.js setup
```

Claude Code（`<安装目录>` 换成实际路径，Windows 也用正斜杠，例如 `C:/tools/zhizhuip-agent-tools`）：

```bash
claude mcp add -s user -e ZHIZHUIP_TOKEN=YOUR_API_KEY zhizhuip -- node <安装目录>/dist/src/index.js
```

## 配置

环境变量：

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `ZHIZHUIP_TOKEN` | 是 | 无 | 网站 API Keys 页面生成的 API Key |
| `ZHIZHUIP_BASE_URL` | 否 | `https://www.zhizhuip.cc` | 指向测试环境时修改 |
| `ZHIZHUIP_TIMEOUT_MS` | 否 | `30000` | 单次请求超时（毫秒） |
| `ZHIZHUIP_CONFIRM_QUIET_MS` | 否 | `10000` | 确认码发出后多久才能用（毫秒），见下文"写操作确认" |

setup 的输出按客户端分段：Claude Code 与 Codex CLI 各一条可直接执行的命令，Claude Desktop、Cursor、经典 Windsurf、VS Code、Zed 各给配置文件位置和 JSON 或 TOML 片段，最后一段是任何支持 stdio 的客户端都能用的标准 `mcpServers` JSON。

注意：客户端不一定继承另一个终端中的环境变量。手工接入时通过客户端 MCP 配置提供 `ZHIZHUIP_TOKEN`；统一安装器则由启动器读取私有凭证文件，再传给 MCP 进程。

## 写操作确认

新增、修改、下单、续费、升级、退单、预约、删除这 23 个工具执行前都会先向你确认：

- 客户端支持 MCP 的弹窗确认（elicitation）时，会弹出操作预览（工具、参数、产品名），你点确认后才请求后端。弹窗未确认时，协议实现可能返回确认码备用流程；如果你已经明确拒绝或取消，助手应停止，不能因为拿到确认码而继续执行或反复询问。
- 客户端不支持时，第一次调用只返回预览和一个 5 分钟有效、只能用一次的确认码，AI 要把预览告诉你，你同意后它再带确认码用同样参数调一次。
- 确认码发出后默认有 10 秒静默期，提前重试会顺延可用时间。时间条件不能证明用户已经同意；助手必须等待明确回复，每次写操作单独确认。`ZHIZHUIP_CONFIRM_QUIET_MS` 只改变时间限制，不能替代授权。
- 这层确认与客户端自带的工具权限弹窗是叠加的，可能问两次。
- 直接启动 MCP 的自动化脚本可显式使用 `--yes` 关闭确认；统一安装器不接受这个选项。`--readonly` 按工具标记过滤写工具，其中 `main_account_switch_token` 首次读取仍可能在后端生成并保存 token，不作为通用健康检查。

## 调试

不接客户端、想直接看工具列表或手动调一个工具，用官方 Inspector，token 同样要通过它的 `-e` 传入：

```bash
npx @modelcontextprotocol/inspector -e ZHIZHUIP_TOKEN=YOUR_API_KEY -- node <安装目录>/dist/src/index.js
```

## 工具清单

产品用 `product` 参数指定：`dynamic-no-expiry` 动态住宅流量（永久）、`dynamic-monthly` 动态住宅流量（期限）、`dynamic-bandwidth` 动态住宅不限流量（带宽）、`static-standard` 静态住宅（非原生）、`static-native` 静态住宅（原生）、`static-isp-native` 静态住宅（运营商原生）、`static-ipv6` 静态住宅（IPv6）、`datacenter` 数据中心。每个工具只列它支持的产品；只对应一种产品的工具没有这个参数。国家一律用 ISO 3166-1 二字码（如 `US`），只有预约 IP 填国家名称。

只读（`--readonly` 模式暴露的全部工具）：

| 工具 | 说明 |
|---|---|
| user_info / user_balance | 账号信息与余额 / 只返回余额 |
| user_price / official_price | 当前账号价格 / 官网价格 |
| coupon_list | 优惠券列表 |
| country_list / state_list / city_list | 国家、州省、城市 |
| provider_list | 动态住宅可用供应商（资源池） |
| sub_account_list | 子账号列表，覆盖全部产品 |
| flow_package_list | 已购流量套餐记录 |
| main_account_switch_token | 动态住宅主账号切换 token |
| sub_account_flow / main_account_flow | 子账号、主账号流量 |
| sub_account_limit_flow / sub_account_limit_flow_batch | 子账号流量上限配置 |
| sub_account_whitelist | 子账号 IP 白名单 |
| bandwidth_package_list / bandwidth_detail / bandwidth_trend | 带宽套餐、详情、趋势 |
| ip_range_status | 静态住宅 IP 段库存状态 |

写操作（默认模式才有，`--readonly` 不暴露）：

| 工具 | 说明 |
|---|---|
| sub_account_add | 新增动态子账号 |
| sub_account_update / sub_account_update_batch | 修改备注、切换间隔 |
| sub_account_set_credentials / sub_account_set_password_batch | 自定义账密 / 批量改密码 |
| sub_account_toggle_port | 批量开关端口连接 |
| sub_account_set_limit_flow / sub_account_set_limit_flow_batch | 设置流量上限 |
| sub_account_delete / sub_account_delete_batch | 删除子账号，不可恢复 |
| order_buy_dynamic_bandwidth | 新购动态不限流量带宽，扣费 |
| order_renew_dynamic_bandwidth | 续费动态不限流量带宽，扣费 |
| order_dynamic_bandwidth_upgrade | 升级动态不限流量带宽，扣费 |
| order_refund_dynamic_bandwidth_apply | 提交动态不限流量退单申请，平台审核后退款 |
| order_buy_dynamic | 购买动态住宅流量，扣费 |
| order_buy_time_ip / order_buy_ipv6 | 购买时长 IP、IPv6 时长 IP，扣费 |
| order_buy_test_ip | 购买测试 IP，扣费并占用测试额度 |
| order_renew / order_renew_ipv6 | 续费，扣费 |
| order_bandwidth_upgrade | 带宽升级，扣费 |
| order_refund_apply | 申请退单 |
| ip_booking | 预约 IP，不扣费 |

### 动态不限流量（带宽）

查询使用 `sub_account_list`，参数示例：

```json
{ "product": "dynamic-bandwidth", "page": 1, "pagesize": 10 }
```

新购使用 `order_buy_dynamic_bandwidth`：

```json
{ "country": "US", "timelen": 1, "bandwidth_num": 10 }
```

动态不限流量（带宽）的四个写工具不需要 `product`，自动携带 `product_type_id=11`。购买一次创建一个子账号；入口国家为 US、DE、SG，带宽单位 Mbps、最低 10，时长档 1/2/3 分别为 30/90/180 天。

续费、升级、退单的 `sub_account_id` 必须取列表的 `rows[].sub_account` 并转成字符串（例如 `"10"`），不要使用同一行的本地记录 `id`。续费前检查 `can_renew`，升级前检查 `can_upgrade`；退单申请等待平台审核，不会立即退款。

目前 `user_price`、`official_price` 不含动态带宽报价。费用和适用优惠券请先在网站核实，再确认执行；扣款以返回的 `real_price` 为准。动态带宽列表只支持分页，其他产品的搜索、流量限制和改密工具不适用于它。

资源 `zhizhuip://docs/dynamic-proxy-session`：动态住宅代理连接串的参数写法与示例。

工具由下载的接口源页结合 `spec/overrides.yaml` 中的后端核对修正生成。调用时 SDK 按 JSON Schema 校验，后端继续做业务条件校验；源页不是当前 MCP 的最终参数合同。

## 跟随文档站更新

本节供源码贡献者使用，请先克隆仓库、进入源码目录并运行 `npm ci`。npm 分发包不包含源页、生成脚本和测试。

接口来源为 [文档站索引](https://develop.zhizhuip.com/llms.txt)，维护流程见 [规格目录说明](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/spec/README.md)。`spec/pages/` 保留下载源快照，现行工具以 `spec/tools.json` 和运行时 schema 为准：

```bash
npm run sync-docs   # 联网更新源快照并生成工具，随后审查差异
npm test            # 若快照变化且差异合理：npx vitest run -u 更新快照
```

Session 原始下载另存为 `spec/source/dynamic-proxy-session.md`，审查后再更新对外的 `spec/dynamic-proxy-session.md`，不会直接覆盖已核对的说明。新增接口会让生成失败并列出路径，把它加进 `spec/overrides.yaml`（或 `ignore`）再跑一次。工具名、中文描述、标注、产品列表与文档缺陷的修正都在 `spec/overrides.yaml`。

## 开发

在已安装依赖的仓库源码目录执行：

```bash
npm test               # 构建 + 全部测试（不联网，端到端测试用本地假后端）
npm run build-spec     # 只用本地 spec/pages 重新生成 tools.json（不联网）
```

涉及在后端创建数据的操作（新增子账号、下单、续费等）不做自动化联调，由维护者用测试账号手动验证。

开发约定见 [AGENTS.md](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/AGENTS.md) 和 [CLAUDE.md](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/CLAUDE.md)。

## 许可

MIT，见 [LICENSE](LICENSE)。
