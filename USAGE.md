# 蜘蛛 IP AI 工具使用指南

蜘蛛 IP MCP 可以让 AI 助手连接你的蜘蛛 IP 账号。配置完成后，你可以直接用自然语言查询余额、子账号、流量、价格和库存，也可以在确认后购买产品、续费、升级带宽或管理子账号。同仓的 `zhizhuip` Skill 为这些操作补充产品选择、连接配置和结果核对流程。

支持动态住宅流量、动态住宅不限流量（带宽）、静态住宅、静态住宅 IPv6 和数据中心产品。不同产品支持的操作有所区别，详见下文。

- [蜘蛛 IP 官网](https://www.zhizhuip.com/)
- [项目仓库](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools)
- [API 文档](https://develop.zhizhuip.com/llms.txt)

## 使用同仓 Skill

推荐按[第 3 节的完整步骤](#3-一次安装-skill-与-mcp)一次安装 Skill 与 MCP：可由 npx 自动从 GitHub 下载并安装，也可先下载源码、进入目录，再安装依赖和运行安装器。支持 Claude Code、Cursor、Codex、Gemini CLI、OpenCode、Windsurf、Cline 或 VS Code Copilot。API Key 在本机输入时显示首尾、中间遮罩，通过在线验证后才安装；完成后重载客户端。

安装预览、项目范围及多客户端命令见第 3 节。Skill 本身不保存 API Key；安装前会查询只读用户信息接口验证 Key，不调用购买、续费或删除等写接口。下文手工 MCP 配置仍适用，但它与单独安装 Skill 是两个步骤。

本项目的 npm 包名和启动命令为 `zhizhuip-agent-tools`，安装后在客户端中查找 `zhizhuip` Skill 和 MCP 服务。统一安装器负责管理固定运行目录。

## 1. 使用前准备

你需要准备：

1. 一个蜘蛛 IP 账号，以及在网站上创建的 API Key。
2. 一个支持本地 **stdio MCP** 的客户端，例如 Claude Desktop、Claude Code、Cursor、Codex 或 VS Code。
3. [Node.js](https://nodejs.org/en/download)，版本需为 **20 或更新**，安装包自带 npm 和 npx。
4. [Git](https://git-scm.com/downloads)，用于从 GitHub 获取项目；电脑需要能够访问 GitHub 和 npm，实际安装还需访问蜘蛛 IP API 验证 Key。

安装完成后，重新打开终端，检查以下命令能否显示版本号：

```bash
node --version
npm --version
git --version
```

本项目由 AI 客户端在本机启动，使用 stdio 通信，没有可填写的远程 MCP URL。只有远程 HTTP 接入功能的客户端不能直接使用本项目，也不要把蜘蛛 IP 官网或 API 地址当成 MCP 地址。

## 2. 获取 API Key

1. 登录蜘蛛 IP 网站。
2. 点击右上角头像，进入 **API Keys**；手机端在“我的”中进入。
3. 新建 Key，复制以 `sk-` 开头的完整内容。
4. 统一安装时在终端输入，核对显示的首尾字符，通过验证后才保存；手工配置时，将相应配置中的 `YOUR_API_KEY` 替换为这个 Key。

获取入口说明见 [API Key 获取方式](https://develop.zhizhuip.com/9518263m0)。

API Key 代表你的账号权限。请仅保存在所用客户端的本机配置中，不要发到公开聊天、网页、截图或代码仓库；项目级配置和安装备份同样可能包含 Key。本文所有 `YOUR_API_KEY` 都是占位符，不能直接用来连接。

## 3. 一次安装 Skill 与 MCP

完成前两节的环境与 API Key 准备后，以下两种方式任选一种。

**实际安装必须通过 API Key 验证。** 安装器先读取 `ZHIZHUIP_TOKEN`；未设置时在交互终端输入，显示首尾各 4 位，中间用星号遮住，输入不超过 8 位时完整显示。按回车前可用退格修改，或按 `Ctrl+C` 取消。交互输入为空时会提示重新输入，不发送验证请求；非交互执行必须预先设置 `ZHIZHUIP_TOKEN`，并通过 `--agents` 指定客户端。

安装器会先查询只读用户信息接口验证 Key。无效 Key、网络错误、超时或异常响应都会显示错误。未提供环境变量 Key 时，手动交互输入失败会继续提示输入，核对 Key 或修复网络后重新输入即可再次验证，也可按 `Ctrl+C` 取消；每次重试都由输入触发，不会自动重复请求。使用环境变量 Key 时，即使在交互终端中，验证失败也会以退出码 1 结束，不转为手动输入；非交互执行失败同样退出，需修正后重新运行命令。验证通过前不会写入运行文件、Skill 或客户端配置，已有安装保持不变。验证只确认当前接口鉴权成功，不保证 Key 此后永久有效或代理转发已经可用。

### 方式一：从 GitHub 自动下载并安装

npx 会自动获取远程仓库代码、安装依赖并构建，再运行安装器。无需先手动下载项目，也无需单独执行 `npm ci`：

```bash
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install
```

### 方式二：下载源码后安装

在终端中进入你希望存放工具的目录，按顺序执行以下完整命令：

```bash
git clone https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools.git
cd zhizhuip-agent-tools
npm ci
node dist/src/index.js install
```

`git clone` 从 GitHub 下载项目，`cd` 进入下载后的源码目录。`npm ci` 必须在包含 `package.json` 和 `package-lock.json` 的目录执行，它会安装依赖并自动构建出 `dist/`；最后一条命令启动安装器。

如果已克隆项目，或通过 GitHub 的 **Code → Download ZIP** 下载并解压，直接进入上述源码目录，从 `npm ci` 开始。

### 通过环境变量提供必填 API Key

如需预先提供 Key，在同一个终端设置 `ZHIZHUIP_TOKEN` 后运行安装命令。以下 `YOUR_API_KEY` 必须替换为网站生成的完整 Key；安装器读取到环境变量后直接验证，不再询问输入。验证失败时，即使在交互终端中也会以退出码 1 结束，需修正变量后重新运行。

Windows PowerShell：

```powershell
$env:ZHIZHUIP_TOKEN = "YOUR_API_KEY"
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install --agents claude-code,cursor,codex
```

macOS / Linux（bash、zsh）：

```bash
ZHIZHUIP_TOKEN="YOUR_API_KEY" npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install --agents claude-code,cursor,codex
```

源码方式使用同一个环境变量，把示例中的 npx 调用换成 `node dist/src/index.js install --agents claude-code,cursor,codex`，并在已构建的工具源码目录执行。自动化环境可通过其密钥配置注入 `ZHIZHUIP_TOKEN`，不要把真实 Key 提交到脚本仓库。

`--help`、`--list` 和 `--dry-run` 只显示说明或预览，不读取 Key、不发送验证请求，也不执行安装，因此无需提供 Key。实际安装和重新安装都会在线验证，通过后才保存。

### 安装选项与完成检查

未通过 `--agents` 指定客户端时，交互终端会提示多选；未设置 `ZHIZHUIP_TOKEN` 时再输入 API Key 并核对显示的首尾字符。默认 `global`，适用于当前用户的各项目。下面以 GitHub 方式示例；源码方式在工具源码目录用 `node dist/src/index.js install` 加相同参数。

```bash
# 一次安装多个客户端。
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install --agents claude-code,cursor,codex
# 查看已适配客户端及作用域。
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install --list
# 只预览项目安装：先把路径换成要接入的业务项目目录。
cd "<你的业务项目目录>"
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install --agents gemini-cli,opencode,vscode --scope project --dry-run
```

`--scope project` 作用于运行命令时的当前目录。确认预览后去掉 `--dry-run` 执行安装。使用本地源码为业务项目安装时，也先进入该业务项目，再用 `node "<工具源码目录的绝对路径>/dist/src/index.js" install --scope project`；不要把工具源码目录误当作要接入的业务项目。

支持的 Agent ID 为 `claude-code`、`cursor`、`codex`、`gemini-cli`、`opencode`、`windsurf`、`cline`、`vscode`。Windsurf 和 Cline 仅支持全局范围；`cline` 指默认 VS Code 用户配置中的扩展，`vscode` 指 VS Code Copilot。经典 Windsurf、远程开发和多 Profile 的范围限制见 [安装说明](README.md#一次安装-skill-与-mcp)。

安装器将同包 Skill 与 MCP 运行文件一起安装，保留其他服务配置并备份改动；部分客户端失败会单独报告，可按相同范围重跑修复。MCP 配置中的启动命令是 Node.js 的绝对路径，参数为 `~/.zhizhuip-agent-tools/versions/<内容指纹>/dist/src/index.js` 的实际绝对路径，只读安装再追加 `--readonly`。移动 Node.js 或换机器后需要重新安装。

所选客户端的 MCP 环境变量中会保存以下三项；OpenCode 的字段名为 `environment`，其他已适配客户端使用 `env`：

| 环境变量 | 安装时保存的值 |
| --- | --- |
| `ZHIZHUIP_TOKEN` | 本次验证通过的 API Key。 |
| `ZHIZHUIP_BASE_URL` | 本次验证使用的 API 地址，默认 `https://www.zhizhuip.cc`。 |
| `ZHIZHUIP_TIMEOUT_MS` | 本次验证使用的请求超时，默认 `30000`，单位毫秒。 |

这三项使用本次安装值，其他已有环境变量继续保留。每个客户端分别保存 Key，重新安装仅更新本次选择的客户端及范围；不再创建单独的凭证文件。配置与备份包含 Key，不要提交到代码仓库或公开分享。

安装成功后重载客户端，并按它的提示启用 Skill、信任项目和允许 MCP。配置写入不代表客户端已经加载，更不代表真实代理已连通；按第 5 节执行一次查询来确认连接。

## 4. 手工配置 MCP（可选）

已通过统一安装器接入的客户端可跳到连接检查。以下用于只安装 MCP、Claude Desktop 或其他未适配的客户端；这些示例不会安装 Skill。

以下示例使用 npx：客户端首次启动时，会从 GitHub 下载项目、安装依赖并构建，第一次启动可能较慢。之后由客户端负责启动和连接，不需要另开终端一直运行服务。

**按客户端分别选择对应格式，不要在同一客户端重复注册同名服务。** 如果配置文件中已有其他服务，请合并 `zhizhuip` 条目，保留原有内容。保存后重启对应客户端，或重新加载该 MCP 服务。

### Claude Desktop

在 Claude Desktop 设置中打开 **Developer → Edit Config**，编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "zhizhuip": {
      "command": "npx",
      "args": ["-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools"],
      "env": {
        "ZHIZHUIP_TOKEN": "YOUR_API_KEY"
      }
    }
  }
}
```

常见配置文件位置：Windows 为 `%APPDATA%\Claude\claude_desktop_config.json`，macOS 为 `~/Library/Application Support/Claude/claude_desktop_config.json`。保存后完全退出并重新打开客户端。操作入口可参考 [本地 MCP 接入说明](https://modelcontextprotocol.io/docs/develop/connect-local-servers)。

### Cursor

编辑全局配置 `~/.cursor/mcp.json`，加入以下内容。Windows 中 `~` 表示你的用户目录。

```json
{
  "mcpServers": {
    "zhizhuip": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools"],
      "env": {
        "ZHIZHUIP_TOKEN": "YOUR_API_KEY"
      }
    }
  }
}
```

也支持项目内的 `.cursor/mcp.json`；个人 Key 建议放在全局配置中。在对话中使用允许调用工具的模式，并确保该服务已启用。配置位置见 [Cursor MCP 文档](https://cursor.com/docs/mcp)。

### Claude Code

在终端执行以下命令，将服务加入个人配置：

```bash
claude mcp add --scope user --env ZHIZHUIP_TOKEN=YOUR_API_KEY --transport stdio zhizhuip -- npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools
```

重新进入 Claude Code 后，可用 `/mcp` 查看连接状态。参数顺序和配置范围见 [Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)。

### Codex

在 `$CODEX_HOME/config.toml` 中加入；未设置 `CODEX_HOME` 时默认是 `~/.codex/config.toml`：

```toml
[mcp_servers.zhizhuip]
command = "npx"
args = ["-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools"]

[mcp_servers.zhizhuip.env]
ZHIZHUIP_TOKEN = "YOUR_API_KEY"
```

如果使用 Codex CLI，也可以用下面的命令添加，两种方式任选一种：

```bash
codex mcp add zhizhuip --env ZHIZHUIP_TOKEN=YOUR_API_KEY -- npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools
```

用 `codex mcp list` 查看配置；进入 CLI 对话后用 `/mcp` 查看连接状态。配置格式见 [Codex MCP 文档](https://developers.openai.com/codex/mcp)。

### VS Code

打开命令面板，执行 **MCP: Open User Configuration**，在打开的 `mcp.json` 中加入：

```json
{
  "servers": {
    "zhizhuip": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools"],
      "env": {
        "ZHIZHUIP_TOKEN": "YOUR_API_KEY"
      }
    }
  }
}
```

这个配置文件的顶层字段是 `servers`。保存后启动该服务，在聊天工具列表中启用它。VS Code 也支持其他配置位置，详见 [VS Code MCP 文档](https://code.visualstudio.com/docs/agent-customization/mcp-servers)。

### Windows 提示找不到 npx 时

把上述 JSON 配置里的 `command` 改为 `cmd`，并在参数开头加入 `/c` 和 `npx`。例如 Claude Desktop 的完整配置为：

```json
{
  "mcpServers": {
    "zhizhuip": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools"],
      "env": {
        "ZHIZHUIP_TOKEN": "YOUR_API_KEY"
      }
    }
  }
}
```

其他客户端保留各自的顶层结构，只替换 `command` 和 `args`。Codex TOML 同样改为 `command = "cmd"`，并使用上面的参数数组。

使用 CLI 添加时，将命令中 `-- npx -y` 改为 `-- cmd /c npx -y`。

### 其他支持 stdio 的客户端

在客户端的 MCP 设置中填写：

| 设置项 | 内容 |
| --- | --- |
| 服务名称 | `zhizhuip` |
| 通信方式 | `stdio` |
| 启动命令 | `npx` |
| 参数 | `-y`、`github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools`，按两个参数填写 |
| 环境变量 | 名称 `ZHIZHUIP_TOKEN`，值为你的 API Key |

也可以执行以下命令，打印各客户端的配置片段，再替换其中的 Key：

```bash
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools setup --npx
```

`setup` 默认输出占位 Key，只打印配置，不安装 Skill 或修改客户端设置。手工配置与统一安装都通过该服务的环境变量传入 Key，不能假定另一个终端的变量会被客户端继承。若显式使用 `setup --token`，提供的 Key 会出现在输出中。

## 5. 确认连接成功

配置完成后，在 AI 对话中发送：

> 使用蜘蛛 IP 工具查询我的账号余额。

如果助手实际调用了 `user_balance` 并返回余额，说明本次 MCP 与管理接口查询成功；它不验证代理流量转发。安装和查询余额本身不会购买产品。

当前版本默认提供 **44 个工具**，其中 **21 个查询工具、23 个写操作工具**。只读模式提供 21 个查询工具。客户端可能折叠工具列表，以服务连接状态和实际查询结果为准。

## 6. 用自然语言操作

不需要记住工具名或手写 API 参数。把产品类型、国家、数量、时长和目标子账号说清楚，助手会选择相应工具；信息不足时应先补充信息。

### 查询账号与资源

> 查询我的余额和可用优惠券。

> 列出我的静态住宅原生子账号，显示国家、IP 和到期时间。

> 查看动态住宅永久流量子账号最近 7 天的用量，按使用量排序。

> 查询美国静态住宅原生 IP 的库存和我的购买价格，先不要下单。

> 列出我的动态不限流量带宽子账号，显示带宽、到期时间以及能否续费、升级。

查询子账号流量时，单次日期范围最多 30 天，结束日期不能晚于今天。列表有分页，查询“全部”时可让助手继续翻页。

### 购买与续费

> 我想购买 10 GB 动态住宅永久流量。先查询我的价格和优惠券，列出购买方案，等我确认再下单。

> 我需要 5 个美国静态住宅原生 IP，使用 30 天、SOCKS5 协议。先查询库存和价格，再让我确认。

> 帮我检查选中的静态住宅子账号能否续费 30 天，列出账号和费用，等我确认。

> 为我购买一个美国入口的动态不限流量带宽子账号，10 Mbps、30 天。先列出参数，并提醒我去网站核实费用，等我确认。

动态期限流量当前仅支持 30 天；动态流量新购为整数 1–5000 GB，不能复用动态带宽的期限枚举。静态 IPv6 购买与续费均不接收优惠券。

购买、续费和带宽升级会按后端规则扣除账号余额。部分操作要求账号先完成验证或实名；遇到提示时，先在网站完成相应步骤。“购买测试 IP”也会扣费并占用测试额度，有效期由平台配置决定；当前 MCP 不提供专用测试价和剩余额度查询，需要先在网站核实。

### 管理子账号

> 将这个动态住宅永久流量子账号的备注改为“项目 A”，先展示目标账号和当前接口可能带来的其他配置变化。

> 为选中的动态住宅流量子账号设置每日流量上限，先让我确认数值和目标账号。

> 删除我指定的两个动态住宅流量子账号，先列出账号和影响，等我确认。

修改、删除会改变真实账号数据；删除子账号不可恢复。当前备注、限流和账密修改会共用后端上游配置更新，可能同时发送默认协议、切换间隔等字段，不能保证“其他配置不动”。如果无法接受这些变化，助手应停止这条写路径，不能仅凭工具名宣称是单项修改。

流量上限设为 `0` 表示删除限制，不能当作停用账号。批量响应需要检查失败明细；删除响应也可能使用成功封装返回“未查询到子账号”，必须结合消息与复查结果报告，不能只看 `code=1`。详细限制见 [子账号管理](skills/zhizhuip/references/account-lifecycle.md)。

### 动态不限流量（带宽）

此产品与按 GB 购买的动态住宅流量不同，当前支持查询子账号、新购、续费、升级带宽和申请退单。

- 新购一次创建一个子账号；入口支持美国 `US`、德国 `DE`、新加坡 `SG`。
- 带宽单位为 Mbps，最低 10 Mbps；购买和续费时长支持 30、90、180 天。
- 升级时填写升级后的总带宽，例如从 10 Mbps 升到 20 Mbps，应指定“升级到 20 Mbps”。
- 续费和升级前，应先查询账号是否可操作。续费、升级和退单需要的账号标识来自列表的 `sub_account` 字段，助手应使用该值，不要混用同一行的 `id`。
- 当前 MCP 的价格查询工具不含该产品报价，也没有该产品的库存查询工具。请先在网站核实费用和优惠券，再确认扣费操作，最终扣款以接口结果为准。
- 该产品的列表接口只支持分页；其他产品的搜索、改密、备注和流量限制工具不适用于它。

可以这样说：

> 检查这个动态不限流量带宽子账号是否可以续费 90 天，先展示账号和续费时长，费用由我在网站核实后再确认。

> 检查这个动态不限流量带宽子账号是否可以从 10 Mbps 升级到 20 Mbps，先展示操作内容，等我确认。

> 为这个动态不限流量带宽子账号申请退单，原因是业务结束。先检查当前状态，并说明这是提交审核申请，等我确认。

退单申请需要平台审核，提交成功不代表已退款；账号是否可用以实际返回状态为准。请在网站查看审核及退款结果，不要重复提交。

### 不同产品支持哪些操作

| 产品 | 常用功能 |
| --- | --- |
| 动态住宅流量（永久、期限） | 购买流量、查询套餐和用量、新建及删除子账号、修改备注和切换间隔、设置流量上限、查询白名单 |
| 动态住宅不限流量（带宽） | 查询子账号、新购、续费、升级带宽、申请退单 |
| 静态住宅（非原生、原生、运营商原生） | 查询子账号和库存、购买、续费、管理账密、切换端口连接、查询及升级带宽、申请退单、预约 IP |
| 静态住宅 IPv6 | 查询子账号、购买、续费、自定义账密 |
| 数据中心 | 查询子账号、购买、续费、管理账密、预约 IP |

实际可购地区、库存、价格和操作资格，以接口返回及网站规则为准。

## 7. 操作确认与只读模式

### 写操作怎样确认

默认配置下，购买、续费、升级、修改、删除、退单等写操作执行前，会先展示操作预览：

- 客户端支持确认弹窗时，在弹窗中核对并确认。
- 没有弹窗，或弹窗未完成确认时，工具可能返回确认码供对话确认。没有明确拒绝时，助手应转述预览并等待你回复；已经拒绝或取消就停止。你无需手动复制确认码。

对话确认码有效期为 5 分钟，只能使用一次；默认生成后有 10 秒静默期，提前重试会延后可用时间。静默期结束不等于你已授权，服务无法仅凭时间识别用户回复，助手必须等待真实同意。确认码过期或修改业务参数后，需要重新预览并确认。

**操作预览只展示动作和参数，不会自动查询价格或余额。** 涉及扣费时，应先核实费用，再确认执行。客户端自身也可能要求一次工具授权，这是另一层权限确认。

### 只查询，不开放写操作

统一安装时加 `install --agents cursor --readonly`，把 `cursor` 换成自己的客户端列表；恢复全部工具时以同一范围重跑并省略 `--readonly`。手工配置在启动参数末尾加入 `--readonly`，例如：

```json
["-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools", "--readonly"]
```

Windows 使用 `cmd` 时改为：

```json
["/c", "npx", "-y", "github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools", "--readonly"]
```

重启服务后，购买、续费、修改、删除等写工具不会加载。这里的“只读”按工具标记过滤；`main_account_switch_token` 首次读取可能生成并保存 token，不应将它用作普通连接检查。

直接启动 MCP 的 `--yes` 会关闭写操作确认，让写操作直接执行；`install` 不接受此选项，默认保留确认机制。

## 8. 本地安装与更新

如果希望自行管理安装目录和版本，可以克隆仓库：

```bash
git clone https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools.git zhizhuip-agent-tools
cd zhizhuip-agent-tools
npm ci
```

`npm ci` 会自动构建。需要 Skill 与 MCP 一起安装时，接着执行 `node dist/src/index.js install`。只手工接入 MCP 时，将客户端配置中的启动命令改为 `node`，参数改为本地 `dist/src/index.js` 的**绝对路径**。例如安装在 `C:/tools/zhizhuip-agent-tools` 时：

```json
{
  "mcpServers": {
    "zhizhuip": {
      "command": "node",
      "args": ["C:/tools/zhizhuip-agent-tools/dist/src/index.js"],
      "env": {
        "ZHIZHUIP_TOKEN": "YOUR_API_KEY"
      }
    }
  }
}
```

请按自己的实际安装目录修改路径；macOS、Linux 同样使用绝对路径。Windows 的 JSON 路径可使用正斜杠 `/`。只读模式仍然在 `args` 末尾加 `"--readonly"`。

也可以在 `zhizhuip-agent-tools` 源码目录执行下列命令，生成适合本地安装的客户端配置：

```bash
node dist/src/index.js setup
```

更新本地安装时，在 `zhizhuip-agent-tools` 源码目录执行：

```bash
git pull
npm ci
```

使用统一安装器时，更新源码和构建后还需要重新安装，才能把新 Skill 和 MCP 复制到固定运行目录。全局安装可在工具源码目录执行 `node dist/src/index.js install --agents <客户端列表> --scope global`；项目范围安装须先回到原业务项目目录，再执行 `node "<工具源码目录的绝对路径>/dist/src/index.js" install --agents <客户端列表> --scope project`。保留原来的客户端选择和 `--readonly` 设置。仅 `git pull` 与 `npm ci` 不会自动更新已复制的安装版本。手工配置直接指向本地构建路径时，构建后重载 MCP 即可。

npx 可能复用缓存；需要精确控制版本时，先取得目标版本的本地源码并构建，再从该目录运行安装器。安装器不自动删除旧运行目录或备份。

已有配置若仍使用 `launch.mjs` 和 `--credentials`，按原客户端列表、安装范围和只读选项重新运行新版安装器，并提供有效 Key。更新后的配置会直接启动 `dist/src/index.js`，Key、API 地址和超时保存在服务环境变量中。未选择的客户端仍使用原配置；旧运行目录和凭证文件不会自动删除，确认不再被其他客户端使用后再自行处理。

## 9. 常见问题

| 问题 | 处理方法 |
| --- | --- |
| 提示缺少 `ZHIZHUIP_TOKEN` | 检查该服务的 `env`（OpenCode 为 `environment`）；统一安装可按原范围重跑并输入有效 Key。不要只在另一个终端设置变量，也不要把完整 Key 发到对话中。 |
| 提示 API Key 无效或已删除 | 确认复制了完整 Key，并检查网站上的 Key 是否仍有效。手动交互安装中直接重新输入；使用环境变量、非交互或已退出时，更新 Key 后重新运行安装。验证失败不会保存新 Key 或覆盖已有配置；更新成功后重载 MCP。 |
| 安装时验证超时、网络失败或响应异常 | 检查网络及服务可用性后，在手动交互提示中重新输入 Key 以再次验证；使用环境变量或非交互执行时，需重新运行安装命令。验证未通过时不会写入安装文件，也不会覆盖已有凭证。 |
| 提示找不到 `node`、`npx` 或 `git` | 安装 Node.js 和 Git 后重启客户端；在终端检查版本号。Windows 的 npx 问题可使用上文 `cmd /c npx` 配置。 |
| 首次启动很久没有连接成功 | 首次需要下载和构建，检查 GitHub、npm 网络以及客户端日志。若启动超时，可先执行本文的 `setup --npx` 命令完成下载，再重新加载服务，或改用本地安装。 |
| 助手只给建议，没有调用工具 | 确认 `zhizhuip` 已连接、工具已启用，并在支持工具的对话模式中明确要求“使用蜘蛛 IP 工具”。 |
| 找不到购买、续费等工具 | 检查是否配置了 `--readonly`，或客户端禁用了相关工具；更改后重新加载服务。 |
| 找不到新工具或 Skill 未更新 | 核对运行版本；统一安装需要从新源码重新运行 install 后重载，直接引用源码路径则重新构建。npx 安装注意缓存。 |
| 动态带宽查不到价格或库存 | 当前 MCP 没有该产品的报价、库存查询能力，请在网站核实，不要沿用其他产品的价格。 |
| 已回复确认，仍提示暂时不能执行 | 在确实已同意且业务参数未变时，遵循静默期提示继续；不要循环试码。确认码超过 5 分钟则重新发起预览。 |
| 提示余额不足、需要实名或参数不支持 | 根据接口提示在网站充值、完成验证，或调整产品参数后重新确认。 |
| 提示访问频繁 | 暂停连续调用，稍后重试，避免让助手高频轮询。 |
| 扣费操作超时，是否可以直接重试 | 超时不代表操作失败。先在网站检查订单、余额和子账号状态，确认结果后再决定，避免重复购买或续费。 |
| 能否直接接入只接受远程 URL 的网页客户端 | 不能直接接入。本项目是本地 stdio 服务，请使用支持该方式的客户端。 |
