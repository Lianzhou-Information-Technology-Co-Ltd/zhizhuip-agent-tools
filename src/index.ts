#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLIENT_CAPABILITIES_META_KEY, McpServer, fromJsonSchema, type ClientCapabilities, type JsonSchemaType, type ServerContext } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { CONFIRM_TOKEN_SCHEMA, ConfirmTokens, withConfirm } from './confirm.js';
import { callApi, cfgFromEnv, type Cfg } from './http.js';
import { renderSetup } from './setup.js';
import type { ToolDef } from './types.js';

const USAGE = `用法：zhizhuip-agent-tools [--readonly] [--yes]
      zhizhuip-agent-tools install [--agents 客户端列表] [--scope global|project] [--readonly]
      zhizhuip-agent-tools setup [--token 你的token] [--readonly] [--npx]
  不带参数     全部 44 个工具，含下单扣费与删除子账号；写操作执行前先向用户确认
  --readonly   只暴露 21 个只读工具
  --yes        写操作不确认直接执行，给自动化脚本用
  install      一次安装 Skill 与 MCP；install --help 查看全部选项
  setup        打印 Claude Code、Claude Desktop、Codex、Cursor、VS Code、Zed、Windsurf 的配置片段，不改任何文件；
               默认按本机安装路径生成，--npx 生成 npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools 的写法`;

const argv = process.argv.slice(2);

if (argv[0] === 'install') {
  const { runInstall } = await import('./install.js');
  process.exit(await runInstall(argv.slice(1)));
}

if (argv[0] === 'setup') {
  const withEq = argv.find(a => a.startsWith('--token='));
  const at = argv.indexOf('--token');
  const token = withEq ? withEq.slice('--token='.length) : at >= 0 ? argv[at + 1] : undefined;
  console.log(renderSetup({ indexPath: fileURLToPath(import.meta.url), token, readonly: argv.includes('--readonly'), npx: argv.includes('--npx'), platform: process.platform }));
  process.exit(0);
}

const flags = new Set(argv);
const readonly = flags.has('--readonly');
const yes = flags.has('--yes');
for (const known of ['--readonly', '--yes']) flags.delete(known);
if (flags.size) {
  console.error(USAGE);
  process.exit(2);
}

let cfg: Cfg;
try {
  cfg = cfgFromEnv();
} catch (e) {
  console.error(`[zhizhuip-agent-tools] ${(e as Error).message}`);
  process.exit(2);
}

// 编译后本文件在 dist/src/，包根在上两级；npx 安装与克隆安装的布局一致
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const { version } = JSON.parse(read('../../package.json')) as { version: string };
const all = JSON.parse(read('../../spec/tools.json')) as ToolDef[];
const tools = readonly ? all.filter(t => t.readOnly) : all;

const SESSION_URI = 'zhizhuip://docs/dynamic-proxy-session';

const INSTRUCTIONS = `蜘蛛 IP（zhizhuip.com）对外接口 externalapi 的 MCP 封装，直接调用后端接口，后端校验参数并返回结果。
- 产品用 product 参数指定：dynamic-no-expiry=动态住宅流量（永久）、dynamic-monthly=动态住宅流量（期限）、dynamic-bandwidth=动态住宅不限流量（带宽）、static-standard=静态住宅（非原生）、static-native=静态住宅（原生）、static-isp-native=静态住宅（运营商原生）、static-ipv6=静态住宅（IPv6）、datacenter=数据中心。每个工具的 product 枚举只列它支持的产品；没有 product 参数的工具只对应一种产品。
- 术语："动态流量类"指 dynamic-no-expiry 与 dynamic-monthly，按流量计费；dynamic-bandwidth 按带宽与时长计费，使用专用的新购、续费、升级、退单工具；动态住宅子账号靠连接串参数切换 IP；"时长类"指 static-* 与 datacenter，按 IP 按天计费。
- 子账号编号按字符串传（如 "77"）：dynamic-bandwidth 取 sub_account_list 返回的 rows[].sub_account 填 sub_account_id（不是本地记录 id），其他产品取 id；要传多个时按参数说明用数组或英文逗号连接。
- 国家参数一律用 ISO 3166-1 二字码（如 US），只有 ip_booking 填国家名称。
- 下单、续费、带宽升级、删除类工具会从余额扣费或不可恢复：调用前先用 user_price、user_balance、coupon_list、sub_account_list 查清价格、余额、优惠券和操作对象，把参数与预计费用告诉用户并取得明确确认。
- 动态不限流量（带宽）购买的 country 是入口国家（US、DE、SG），最低 10 Mbps；续费和升级前检查列表中的 can_renew、can_upgrade、refunding。user_price、official_price 尚不含此产品报价，费用和适用优惠券须先在网站核实，不能套用流量或静态 IP 的价格。
- 写操作工具执行前必须经用户确认：支持弹窗的客户端会弹出操作预览让用户点选；没弹窗或不支持的客户端会返回预览和 confirm_token，要把预览原样转述给用户，得到明确同意后再带 confirm_token 用相同参数调用。返回文本说"弹窗没有得到确认"时，可能是客户端没显示弹窗，也可能是用户拒绝了，同样只转述一次，用户不要就停。不要替用户做决定，用户没回答就不要带确认码重试。每一次写操作都要单独确认，同样的操作再做一次也要重新问；确认码有时间限制，但服务无法据此判断用户是否回复；助手必须等待用户明确同意，不能用等待时间替代授权。
- 工具成功时返回 {code, msg, data} 的 JSON；失败时 isError 为 true，文本就是后端给出的原因。若提示 API Key 无效，请用户到网站 API Keys 页面核对或重新生成 API Key，并更新 ZHIZHUIP_TOKEN。
- 动态住宅代理连接串的写法（cty/st/ct/ss/tm/spec 参数）见资源 ${SESSION_URI}。`;

function createServer(): McpServer {
  const server = new McpServer({ name: 'zhizhuip-agent-tools', version }, { instructions: INSTRUCTIONS });

  const tokens = new ConfirmTokens(Date.now, cfg.confirmQuietMs);
  // 2026 版协议把客户端能力放在每个请求的信封里，2025 版放在连接初始化时
  const supportsElicitation = (ctx: ServerContext): boolean => {
    const fromEnvelope = (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[CLIENT_CAPABILITIES_META_KEY] as ClientCapabilities | undefined;
    const cap = (fromEnvelope ?? server.server.getClientCapabilities())?.elicitation as Record<string, unknown> | undefined;
    // 只声明 URL 型弹窗的客户端弹不出表单，当作不支持，直接走确认码
    return !!cap && (cap.form !== undefined || Object.keys(cap).length === 0);
  };

  for (const t of tools) {
    const confirm = !yes && !t.readOnly;
    const schema = confirm ? { ...t.inputSchema, properties: { ...t.inputSchema.properties, confirm_token: CONFIRM_TOKEN_SCHEMA } } : t.inputSchema;
    const exec = (args: Record<string, unknown>) => callApi(t, args, cfg);
    const handler = confirm ? withConfirm(t, { supportsElicitation, exec, tokens }) : exec;
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        // 生成好的 JSON Schema 原样下发；SDK 用内置 Ajv 在调用前校验参数
        inputSchema: fromJsonSchema<Record<string, unknown>>(schema as JsonSchemaType),
        annotations: {
          title: t.title,
          readOnlyHint: t.readOnly,
          destructiveHint: t.destructive,
          idempotentHint: t.readOnly,
          openWorldHint: true,
        },
      },
      handler,
    );
  }

  server.registerResource(
    'dynamic-proxy-session',
    SESSION_URI,
    {
      title: '动态 IP Session 使用说明',
      description: '动态住宅代理连接串的参数规则（cty、st、ct、ss、tm、spec）、正误示例与资源池说明',
      mimeType: 'text/markdown',
    },
    async uri => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: read('../../spec/dynamic-proxy-session.md') }] }),
  );

  return server;
}

if (!readonly) {
  console.error(yes
    ? '[zhizhuip-agent-tools] --yes：写操作不经确认直接执行。'
    : '[zhizhuip-agent-tools] 当前包含下单扣费与删除子账号的操作工具，执行前会向用户确认；只想查询请加 --readonly。');
}
serveStdio(createServer, { onerror: e => console.error(`[zhizhuip-agent-tools] ${e.message}`) });
