import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const ENTRY = 'dist/src/index.js';

type Hit = { url: string; method: string; body: string; token?: string; ua?: string };
const hits: Hit[] = [];
let baseUrl = '';

const backend = createServer((req, res) => {
  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    hits.push({ url: req.url ?? '', method: req.method ?? '', body, token: req.headers.token as string | undefined, ua: req.headers['user-agent'] });
    res.setHeader('content-type', 'application/json');
    const url = new URL(req.url ?? '/', 'http://fake');
    const data = url.pathname === '/externalapi/user/getGetUserInfo' ? { money: '3347.42', origin_money: '3293.23', give_money: '54.19' } : { echo: true };
    res.end(JSON.stringify({ code: 1, msg: 'ok', time: '1', data }));
  });
});

beforeAll(async () => {
  await new Promise<void>(r => backend.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(backend.address() as { port: number }).port}`;
});
afterAll(() => backend.close());

type ConnectOptions = { elicit?: 'accept' | 'decline'; messages?: string[]; modern?: boolean; quietMs?: number; capabilities?: Record<string, unknown> };

async function connect(args: string[], opts: ConnectOptions = {}): Promise<Client> {
  const client = new Client({ name: 'test', version: '0.0.0' }, {
    capabilities: opts.capabilities ?? (opts.elicit ? { elicitation: {} } : {}),
    versionNegotiation: opts.modern ? { mode: 'auto' } : undefined,
  });
  if (opts.elicit) {
    client.setRequestHandler('elicitation/create', async request => {
      opts.messages?.push((request.params as { message: string }).message);
      return opts.elicit === 'accept' ? { action: 'accept', content: { confirm: true } } : { action: 'decline' };
    });
  }
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY, ...args],
    env: { ...(process.env as Record<string, string>), ZHIZHUIP_TOKEN: 'sk-test', ZHIZHUIP_BASE_URL: baseUrl, ZHIZHUIP_CONFIRM_QUIET_MS: String(opts.quietMs ?? 0) },
    stderr: 'ignore',
  }));
  return client;
}

const textOf = (r: { content?: unknown }) => ((r.content as { text: string }[])[0]).text;
const LIST = { name: 'sub_account_list', arguments: { product: 'static-native', page: 1, pagesize: 10 } };
const WRITE = { name: 'sub_account_update_batch', arguments: { product: 'dynamic-no-expiry', ids: '12,13', remark: '测试' } };

describe('stdio server', () => {
  it('不带参数暴露全部 44 个工具，扣费与删除工具带 destructiveHint', async () => {
    const c = await connect([]);
    const { tools } = await c.listTools();
    expect(tools).toHaveLength(44);
    expect(tools.find(t => t.name === 'order_buy_time_ip')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
    expect(tools.find(t => t.name === 'ip_booking')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(tools.find(t => t.name === 'user_info')?.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
    await c.close();
  }, 20_000);

  it('--readonly 只暴露 21 个只读工具与 1 个资源', async () => {
    const c = await connect(['--readonly']);
    const { tools } = await c.listTools();
    expect(tools).toHaveLength(21);
    expect(tools.every(t => t.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.find(t => t.name === 'sub_account_list')?.inputSchema.required).toEqual(['product', 'page', 'pagesize']);

    const { resources } = await c.listResources();
    expect(resources.map(r => r.uri)).toEqual(['zhizhuip://docs/dynamic-proxy-session']);
    const read = await c.readResource({ uri: 'zhizhuip://docs/dynamic-proxy-session' });
    expect((read.contents[0] as { text: string }).text).toContain('-ss-sessionA-tm-20m');
    await c.close();
  }, 20_000);

  it('动态带宽列表发送 product_type_id=11，readonly 不暴露新写工具', async () => {
    const c = await connect(['--readonly']);
    hits.length = 0;
    const { tools } = await c.listTools();
    expect(tools.some(t => t.name.startsWith('order_'))).toBe(false);
    const r = await c.callTool({ name: 'sub_account_list', arguments: { product: 'dynamic-bandwidth', page: 1, pagesize: 10 } });
    expect(r.isError).toBeFalsy();
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ method: 'GET', url: '/externalapi/device/accountList?page=1&pagesize=10&product_type_id=11&is_mcp_send=1' });
    await c.close();
  }, 20_000);

  it('动态带宽四个写操作先确认再发到各自路由，优惠券字段与子账号编号原样传递', async () => {
    const c = await connect([]);
    const cases: [string, string, Record<string, unknown>][] = [
      ['order_buy_dynamic_bandwidth', 'product_order/createProductOrder', { country: 'US', timelen: 1, bandwidth_num: 10, conpon_id: 7 }],
      ['order_renew_dynamic_bandwidth', 'set_meal/renewOrder', { sub_account_id: '10', timelen: 2, conpon_id: 7 }],
      ['order_dynamic_bandwidth_upgrade', 'product_order/dynamicBandwidthUpgradeOrder', { sub_account_id: '10', bandwidth_num: 20, conpon_id: 7 }],
      ['order_refund_dynamic_bandwidth_apply', 'product_order/createOrderBack', { sub_account_id: '10', remark: '不再使用' }],
    ];
    for (const [name, path, args] of cases) {
      hits.length = 0;
      const first = await c.callTool({ name, arguments: args });
      expect(first.isError, name).toBeFalsy();
      const token = textOf(first).match(/confirm_token=([0-9a-f]+)/)?.[1];
      expect(token, name).toBeTruthy();
      expect(hits, name).toHaveLength(0);
      const result = await c.callTool({ name, arguments: { ...args, confirm_token: token } });
      expect(result.isError, name).toBeFalsy();
      expect(hits, name).toHaveLength(1);
      expect(hits[0]).toMatchObject({ method: 'POST', url: '/externalapi/' + path });
      expect(Object.fromEntries(new URLSearchParams(hits[0].body))).toEqual({
        ...Object.fromEntries(Object.entries(args).map(([k, v]) => [k, String(v)])), product_type_id: '11', is_mcp_send: '1',
      });
    }
    hits.length = 0;
    for (const args of [
      { sub_account_id: '10', timelen: 1, product_type_id: 12 },
      { id: '78', timelen: 1 },
      { sub_account_id: '10', timelen: 0 },
    ]) {
      const bad = await c.callTool({ name: 'order_renew_dynamic_bandwidth', arguments: args });
      expect(bad.isError).toBe(true);
    }
    expect(hits).toHaveLength(0);
    await c.close();
  }, 20_000);

  it('工具定义里的 defaults 由 MCP 补上：不传 page、pagesize 时按 1 与 100 发', async () => {
    const c = await connect(['--readonly']);
    hits.length = 0;
    const r = await c.callTool({ name: 'sub_account_limit_flow_batch', arguments: { product: 'dynamic-no-expiry', accounts: '1,2' } });
    expect(r.isError).toBeFalsy();
    expect(decodeURIComponent(hits[0].url)).toBe('/externalapi/tool/accountLimitFlowBatchDetail?page=1&pagesize=100&accounts=1,2&type=0&status=0&is_month=0&is_mcp_send=1');
    await c.close();
  }, 20_000);

  it('派生工具 user_balance 只返回 data 里的 money', async () => {
    const c = await connect(['--readonly']);
    const r = await c.callTool({ name: 'user_balance', arguments: {} });
    expect(JSON.parse(textOf(r))).toEqual({ code: 1, msg: 'ok', data: '3347.42' });
    await c.close();
  }, 20_000);

  it('GET 把 product 展开进 query 并带 token 与 UA；POST 走表单并展开括号参数', async () => {
    const c = await connect(['--yes']);
    hits.length = 0;

    const r1 = await c.callTool(LIST);
    expect(r1.isError).toBeFalsy();
    expect(JSON.parse(textOf(r1))).toEqual({ code: 1, msg: 'ok', data: { echo: true } });
    expect(hits[0]).toMatchObject({ method: 'GET', url: '/externalapi/device/accountList?page=1&pagesize=10&type=1&status=1&native=1&is_mcp_send=1', token: 'sk-test', ua: 'zhizhuip mcp' });

    await c.callTool({
      name: 'sub_account_set_credentials',
      arguments: { product: 'datacenter', content: [{ id: '32', customUsername: 'user0001', customPassword: 'pass0001' }] },
    });
    expect(hits[1].method).toBe('POST');
    expect(hits[1].url).toBe('/externalapi/device/batchUpdateSubAccountUsernamePassword');
    expect(decodeURIComponent(hits[1].body)).toBe('content[0][id]=32&content[0][customUsername]=user0001&content[0][customPassword]=pass0001&type=2&status=1&is_mcp_send=1');
    await c.close();
  }, 20_000);

  it('单产品工具没有 product 参数，产品组合从 fixed 附加；传了 product 会被拒绝', async () => {
    const c = await connect(['--yes']);
    hits.length = 0;
    const ok = await c.callTool({ name: 'order_buy_ipv6', arguments: { num: 1, country: 'US', timelen: 1, agree: 'SOCKS5' } });
    expect(ok.isError).toBeFalsy();
    expect(decodeURIComponent(hits[0].body)).toBe('num=1&country=US&timelen=1&agree=SOCKS5&type=1&status=1&native=1&version=6&is_mcp_send=1');

    const bad = await c.callTool({ name: 'order_buy_ipv6', arguments: { product: 'static-ipv6', num: 1, country: 'US', timelen: 1, agree: 'SOCKS5' } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toMatch(/additional properties/);
    expect(hits).toHaveLength(1);
    await c.close();
  }, 20_000);

  it('product 不在枚举里、参数类型不对、参数名写错都被 SDK 拦下，不请求后端；未知工具在客户端抛协议错误', async () => {
    const c = await connect([]);
    hits.length = 0;
    const wrongProduct = await c.callTool({ name: 'bandwidth_trend', arguments: { product: 'datacenter', trend_type: 1, subAccount: '7' } });
    expect(wrongProduct.isError).toBe(true);
    expect(textOf(wrongProduct)).toMatch(/allowed values/);

    const wrongType = await c.callTool({ name: 'sub_account_update_batch', arguments: { product: 'dynamic-no-expiry', ids: [1, 2] } });
    expect(wrongType.isError).toBe(true);
    expect(textOf(wrongType)).toMatch(/must be string/);

    const wrongName = await c.callTool({ name: 'sub_account_list', arguments: { ...LIST.arguments, page_size: 10 } });
    expect(wrongName.isError).toBe(true);
    expect(textOf(wrongName)).toMatch(/additional properties/);

    expect(hits).toHaveLength(0);
    await expect(c.callTool({ name: 'no_such_tool', arguments: {} })).rejects.toThrow(/not found/);
    await c.close();
  }, 20_000);

  it('setup 子命令打印各客户端的配置片段并以 0 退出，不需要 token 环境变量', () => {
    const r = spawnSync(process.execPath, [ENTRY, 'setup', '--token', 'sk-abc'], { encoding: 'utf8', env: { ...process.env, ZHIZHUIP_TOKEN: '' } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('claude mcp add');
    expect(r.stdout).toContain('ZHIZHUIP_TOKEN=sk-abc');
    expect(r.stdout).toContain('context_servers');
    expect(r.stdout).toContain('dist/src/index.js');
    const npx = spawnSync(process.execPath, [ENTRY, 'setup', '--npx', '--token', 'sk-abc'], { encoding: 'utf8', env: { ...process.env, ZHIZHUIP_TOKEN: '' } });
    expect(npx.stdout).toContain('npx -y github:Lianzhou-Information-Technology-Co-Ltd/zhizhuip-agent-tools');
  });

  it('参数不认识或缺少 ZHIZHUIP_TOKEN 时以退出码 2 结束并给出提示', () => {
    const bad = spawnSync(process.execPath, [ENTRY, 'bogus'], { encoding: 'utf8' });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('用法');

    const noToken = spawnSync(process.execPath, [ENTRY], { encoding: 'utf8', env: { ...process.env, ZHIZHUIP_TOKEN: '' } });
    expect(noToken.status).toBe(2);
    expect(noToken.stderr).toContain('ZHIZHUIP_TOKEN');
  });
});

describe('写操作确认', () => {
  it('客户端支持弹窗确认：弹窗文案含工具名与带中文标签的 product，用户同意后才请求后端', async () => {
    const messages: string[] = [];
    const c = await connect([], { elicit: 'accept', messages });
    hits.length = 0;
    const r = await c.callTool(WRITE);
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(textOf(r))).toMatchObject({ code: 1 });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('批量修改子账号（sub_account_update_batch）');
    expect(messages[0]).toContain('- product：dynamic-no-expiry（动态住宅流量（永久））');
    expect(hits).toHaveLength(1);
    expect(decodeURIComponent(hits[0].body)).toBe('ids=12,13&remark=测试&type=0&status=0&is_month=0&is_mcp_send=1');
    await c.close();
  }, 20_000);

  it('新协议客户端同样走弹窗确认', async () => {
    const messages: string[] = [];
    const c = await connect([], { elicit: 'accept', messages, modern: true });
    hits.length = 0;
    expect((await c.callTool(WRITE)).isError).toBeFalsy();
    expect(messages).toHaveLength(1);
    expect(hits).toHaveLength(1);
    await c.close();
  }, 20_000);

  it('弹窗回了拒绝：不请求后端，退到确认码', async () => {
    const c = await connect([], { elicit: 'decline' });
    hits.length = 0;
    const r = await c.callTool(WRITE);
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain('弹窗没有得到确认');
    expect(textOf(r)).toMatch(/confirm_token=[0-9a-f]+/);
    expect(hits).toHaveLength(0);
    await c.close();
  }, 20_000);

  it('客户端只支持 URL 型弹窗：当作不支持，直接给预览与确认码', async () => {
    const c = await connect([], { capabilities: { elicitation: { url: {} } } });
    hits.length = 0;
    const r = await c.callTool(WRITE);
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toContain('待确认');
    expect(textOf(r)).toMatch(/confirm_token=[0-9a-f]+/);
    expect(hits).toHaveLength(0);
    await c.close();
  }, 20_000);

  it('客户端不支持弹窗：先返回预览与确认码，带码重调才执行，确认码只能用一次', async () => {
    const c = await connect([]);
    hits.length = 0;
    const first = await c.callTool(WRITE);
    expect(first.isError).toBeFalsy();
    expect(textOf(first)).toContain('待确认');
    expect(textOf(first)).toContain('- ids：12,13');
    const token = textOf(first).match(/confirm_token=([0-9a-f]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(hits).toHaveLength(0);

    const done = await c.callTool({ ...WRITE, arguments: { ...WRITE.arguments, confirm_token: token } });
    expect(done.isError).toBeFalsy();
    expect(hits).toHaveLength(1);
    expect(decodeURIComponent(hits[0].body)).toBe('ids=12,13&remark=测试&type=0&status=0&is_month=0&is_mcp_send=1');

    const reused = await c.callTool({ ...WRITE, arguments: { ...WRITE.arguments, confirm_token: token } });
    expect(reused.isError).toBe(true);
    expect(hits).toHaveLength(1);
    await c.close();
  }, 20_000);

  it('默认静默期下拿到确认码立刻重调会被拒，后端无请求', async () => {
    const c = await connect([], { quietMs: 10_000 });
    hits.length = 0;
    const token = textOf(await c.callTool(WRITE)).match(/confirm_token=([0-9a-f]+)/)?.[1];
    const early = await c.callTool({ ...WRITE, arguments: { ...WRITE.arguments, confirm_token: token } });
    expect(early.isError).toBe(true);
    expect(textOf(early)).toContain('确认码还不能用');
    expect(hits).toHaveLength(0);
    await c.close();
  }, 20_000);

  it('--yes 时写操作直接执行，不弹窗', async () => {
    const messages: string[] = [];
    const c = await connect(['--yes'], { elicit: 'accept', messages });
    hits.length = 0;
    expect((await c.callTool(WRITE)).isError).toBeFalsy();
    expect(messages).toHaveLength(0);
    expect(hits).toHaveLength(1);
    await c.close();
  }, 20_000);

  it('只读工具从不确认；只有写工具的 schema 带 confirm_token', async () => {
    const messages: string[] = [];
    const c = await connect([], { elicit: 'accept', messages });
    hits.length = 0;
    expect((await c.callTool(LIST)).isError).toBeFalsy();
    expect(messages).toHaveLength(0);
    expect(hits).toHaveLength(1);
    const { tools } = await c.listTools();
    expect(tools.find(t => t.name === 'sub_account_update_batch')?.inputSchema.properties).toHaveProperty('confirm_token');
    expect(tools.find(t => t.name === 'sub_account_list')?.inputSchema.properties).not.toHaveProperty('confirm_token');
    await c.close();
  }, 20_000);
});
