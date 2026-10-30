# zhizhuip-agent-tools

让 Claude Code、Cursor、Codex 等 AI 助手帮你查询蜘蛛 IP 账号、选购代理、生成连接配置和管理子账号。**一次安装，同时配置 Skill 与 MCP。**

## 一次安装 Skill 与 MCP

### 1. 准备环境和 API Key

- 安装 [Node.js 20 或更新版本](https://nodejs.org/en/download)和 [Git](https://git-scm.com/downloads)，确保终端能运行 `node`、`npx`、`git`，并能访问 GitHub、npm 和蜘蛛 IP 服务。
- 登录[蜘蛛 IP 官网](https://www.zhizhuip.com/)，从头像菜单进入 **API Keys**，创建并复制 API Key。它是安装必填项，输入到安装终端即可，无需发给 AI。

### 2. 运行安装命令

以下两种方式任选一种。

#### 方式 1：一键安装

在 PowerShell、终端或 Git Bash 中执行：

```bash
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install
```

命令会自动下载项目、安装依赖并构建，**无需提前下载源码或运行 `npm ci`**。首次下载请耐心等待。

#### 方式 2：Git 下载到本地安装

在准备存放项目的目录打开终端，依次执行：

```bash
git clone https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools.git
cd zhizhuip-agent-tools
npm ci
node dist/src/index.js install
```

`git clone` 下载项目，`cd` 进入项目目录，`npm ci` 安装依赖并自动构建，最后一条命令启动安装器。已有源码时，进入项目目录后执行最后两条命令即可。

#### 完成安装

按提示输入客户端 ID（例如 `codex`，多个用英文逗号分隔），再粘贴 API Key 并回车。默认安装到当前用户，所有项目可用；Key 验证通过后才开始安装，手动输错可继续输入，`Ctrl+C` 取消。若已设置 `ZHIZHUIP_TOKEN`，会直接使用该环境变量，验证失败需修改变量后重跑。

### 3. 重启客户端，开始使用

看到“Skill 和 MCP 配置已安装”后，重启所选客户端。按客户端提示启用 `zhizhuip` MCP 和 Skill，然后对 AI 说：

> 使用蜘蛛 IP 查询我的账户余额。

返回实际余额即可确认 MCP 连接。之后可以继续说：

- “列出我的蜘蛛 IP 子账号。”
- “帮我选一个适合固定出口的产品，先查价格。”
- “用我已有的动态住宅账号生成代理连接配置。”

没有显示工具或查询失败时，见[连接检查与常见问题](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/USAGE.md#5-确认连接成功)。

## 选择客户端与安装选项

只安装到 Codex 时，在安装命令后加 `--agents codex`。同时安装到 Claude Code、Cursor 和 Codex：

```bash
npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools install --agents claude-code,cursor,codex
```

| 客户端 | `--agents` 名称 |
| --- | --- |
| Claude Code | `claude-code` |
| Cursor | `cursor` |
| Codex | `codex` |
| Gemini CLI | `gemini-cli` |
| OpenCode | `opencode` |
| 经典 Windsurf | `windsurf` |
| Cline（VS Code 扩展） | `cline` |
| VS Code Copilot | `vscode` |

以下选项适用于两种安装方式，均追加在 `install` 后：

| 选项 | 用途 |
| --- | --- |
| `--readonly` | 只启用标为只读的工具。 |
| `--scope project` | 仅为当前项目安装；请先进入要使用蜘蛛 IP 的项目目录。 |
| `--dry-run` | 预览安装位置，不写文件、不验证 Key。 |
| `--list` | 查看适配客户端及安装范围。 |
| `--help` | 查看完整参数说明。 |

Windsurf 和 Cline 仅支持用户全局安装。Windsurf 适配经典 `.codeium/windsurf` 目录；Cline 和 VS Code 适配本机默认用户配置，不覆盖远程开发、其他 Profile 或 Insiders。

## 使用须知

- 安装不会购买产品。默认开放查询与管理能力，购买、续费、删除等操作执行前需要确认；费用与产品限制以网站及实际返回结果为准。
- API Key 保存在所选客户端的本地配置中。配置和安装备份可能包含 Key，请勿提交到仓库或分享。

## 更多文档

- [使用指南](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/USAGE.md)：客户端配置、使用示例与更新方法。
- [Skill 操作指南](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/skills/zhizhuip/SKILL.md)：产品选择、查询与管理流程。
- [工具覆盖表](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/skills/zhizhuip/references/tool-map.md)：支持的工具、产品范围与使用限制。
- [API 文档](https://develop.zhizhuip.com/llms.txt) · [开发与维护约定](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/AGENTS.md)。

## 许可

[MIT](https://github.com/Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools/blob/main/LICENSE)。
