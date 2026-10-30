import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

type Envelope = { code: number; msg: string; data: unknown };
type ProductCase = {
  args?: Record<string, unknown>;
  form: Record<string, string>;
  response?: Envelope;
};
type ToolCase = {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  args: Record<string, unknown>;
  form: Record<string, string>;
  products?: Record<string, ProductCase>;
  fixedProduct?: string;
  response: Envelope;
  expected?: Envelope;
};
type Variant = {
  tool: ToolCase;
  product?: string;
  args: Record<string, unknown>;
  form: Record<string, string>;
  response: Envelope;
  expected: Envelope;
};
type Result = { content?: unknown; isError?: unknown };
type Hit = { method: string; path: string; query: string; body: string; headers: Record<string, unknown> };
type Reply = { body?: Envelope; disconnect?: boolean };
type Pending = { variant: Variant; token: string };
type SpecEntry = { name: string; readOnly: boolean; products?: Record<string, unknown> };

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ENTRY = fileURLToPath(new URL('../dist/src/index.js', import.meta.url));
const fixture = JSON.parse(readFileSync(new URL('./evals/tool-cases.json', import.meta.url), 'utf8')) as { cases: ToolCase[] };
const spec = JSON.parse(readFileSync(new URL('../spec/tools.json', import.meta.url), 'utf8')) as SpecEntry[];
const API_TOKEN = 'sk-OFFLINE-SKILL-WORKFLOWS';
const hits: Hit[] = [];
const replies: Reply[] = [];
let client: Client;
let stderr = '';

/**
 * 将人工样例中的一个产品变体组成独立调用；预期表单只来自 fixture。
 *
 * @param tool 工具的人工样例。
 * @param product 产品变体名称；省略时使用不接收 product 的工具样例。
 * @return 返回调用参数、预期表单及模拟响应，不读取工具定义推导预期。
 */
function variantOf(tool: ToolCase, product?: string): Variant {
  const productCase = product === undefined ? undefined : tool.products?.[product];
  if (product !== undefined && !productCase) throw new Error(`缺少产品样例：${tool.name}/${product}`);
  const response = productCase?.response ?? tool.response;
  return {
    tool,
    product,
    args: { ...tool.args, ...(product === undefined ? {} : { product }), ...productCase?.args },
    form: { ...tool.form, ...productCase?.form, is_mcp_send: '1' },
    response,
    expected: tool.expected ?? response,
  };
}

/**
 * 按名称读取人工样例，供多步流程复用明确的请求预期。
 *
 * @param name 工具名称。
 * @param product 产品变体；专用工具和无产品工具省略。
 * @return 返回匹配的调用样例；缺失时直接使测试失败。
 */
function sample(name: string, product?: string): Variant {
  const tool = fixture.cases.find(item => item.name === name);
  if (!tool) throw new Error(`缺少工具样例：${name}`);
  return variantOf(tool, product);
}

/**
 * 提取 MCP 的文本内容，避免把整个协议对象当作业务成功。
 *
 * @param result MCP 工具调用结果。
 * @return 返回文本块的合并内容；无文本时返回空字符串。
 */
function textOf(result: Result): string {
  return (result.content as { type: string; text?: string }[] ?? [])
    .filter(item => item.type === 'text')
    .map(item => item.text ?? '')
    .join('\n');
}

/**
 * 核对最终发往假后端的请求及敏感字段边界。
 *
 * @param hit 假后端实际收到的一次请求。
 * @param variant 独立样例给出的请求预期。
 * @param confirmation 写操作使用的确认码；只读调用省略。
 * @return void，不返回业务结果；断言失败时终止当前测试。
 */
function assertRequest(hit: Hit, variant: Variant, confirmation?: string): void {
  expect(hit.method).toBe(variant.tool.method);
  expect(hit.path).toBe(variant.tool.path);
  expect(hit.headers.token).toBe(API_TOKEN);
  expect(hit.headers['user-agent']).toBe('zhizhuip mcp');
  expect(hit.headers['accept-language']).toBe('zh-CN');
  expect(hit.headers.accept).toBe('application/json');
  const encoded = hit.method === 'GET' ? hit.query : hit.body;
  expect(Object.fromEntries(new URLSearchParams(encoded))).toEqual(variant.form);
  expect(new URLSearchParams(encoded).size).toBe(Object.keys(variant.form).length);
  if (hit.method === 'GET') {
    expect(hit.body).toBe('');
  } else {
    expect(hit.query).toBe('');
    expect(hit.headers['content-type']).toContain('application/x-www-form-urlencoded');
  }
  expect(encoded).not.toContain('product=');
  expect(encoded).not.toContain('confirm_token');
  expect(encoded).not.toContain(API_TOKEN);
  if (confirmation) expect(JSON.stringify(hit)).not.toContain(confirmation);
}

/**
 * 请求写操作预览，并证明此时没有触达后端。
 *
 * @param variant 即将执行的写操作样例。
 * @return 返回绑定该次参数的待确认记录，尚不代表同意执行。
 */
async function requestPreview(variant: Variant): Promise<Pending> {
  const count = hits.length;
  const result = await client.callTool({ name: variant.tool.name, arguments: variant.args });
  expect(result.isError).toBeFalsy();
  const preview = textOf(result);
  expect(preview).toContain('待确认，尚未执行');
  expect(preview).toContain(variant.tool.name);
  expect(hits).toHaveLength(count);
  const token = preview.match(/confirm_token=([0-9a-f]+)/)?.[1];
  expect(token).toBeTruthy();
  return { variant, token: token! };
}

/**
 * 仅在测试明确提供模拟用户同意后，消费该次确认码。
 *
 * @param pending 已展示预览的调用及确认码。
 * @param userReply 模拟用户的明确同意；没有回复时不得调用本方法。
 * @param reply 假后端下一次响应；省略时返回样例中的成功数据。
 * @return 返回执行结果；业务失败和网络中断仍由调用方核对。
 */
async function executeConfirmed(
  pending: Pending,
  userReply: '用户明确同意',
  reply: Reply = { body: pending.variant.response },
): Promise<Result> {
  expect(userReply).toBe('用户明确同意');
  const count = hits.length;
  replies.push(reply);
  const result = await client.callTool({
    name: pending.variant.tool.name,
    arguments: { ...pending.variant.args, confirm_token: pending.token },
  });
  expect(hits).toHaveLength(count + 1);
  assertRequest(hits[count], pending.variant, pending.token);
  expect(textOf(result)).not.toContain(pending.token);
  expect(stderr).not.toContain(pending.token);
  expect(stderr).not.toContain(API_TOKEN);
  return result;
}

/**
 * 执行一次只读调用，并验证后端请求和业务结果。
 *
 * @param variant 只读工具的独立样例。
 * @return 返回解析后的业务响应，供后续步骤使用真实返回字段。
 */
async function readOnce(variant: Variant): Promise<Envelope> {
  const count = hits.length;
  replies.push({ body: variant.response });
  const result = await client.callTool({ name: variant.tool.name, arguments: variant.args });
  expect(result.isError).toBeFalsy();
  expect(hits).toHaveLength(count + 1);
  assertRequest(hits[count], variant);
  const body = JSON.parse(textOf(result)) as Envelope;
  expect(body).toEqual(variant.expected);
  return body;
}

const backend = createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    hits.push({
      method: request.method ?? '',
      path: url.pathname,
      query: url.search.slice(1),
      body,
      headers: { ...request.headers },
    });
    const reply = replies.shift();
    if (reply?.disconnect) {
      request.socket.destroy();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(reply?.body ?? { code: 0, msg: '未安排的后端请求', data: null }));
  });
});

beforeAll(async () => {
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve));
  const address = backend.address() as { address: string; port: number };
  expect(address.address).toBe('127.0.0.1');
  client = new Client({ name: 'offline-skill-workflows', version: '0.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    cwd: ROOT,
    env: {
      ...(process.env as Record<string, string>),
      ZHIZHUIP_TOKEN: API_TOKEN,
      ZHIZHUIP_BASE_URL: `http://127.0.0.1:${address.port}`,
      ZHIZHUIP_TIMEOUT_MS: '2000',
      // 只缩短本地测试的时间条件；每个写操作仍先预览，再提供模拟用户同意。
      ZHIZHUIP_CONFIRM_QUIET_MS: '0',
    },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  await client.connect(transport);
}, 20_000);

beforeEach(() => {
  hits.length = 0;
  replies.length = 0;
  stderr = '';
});

afterAll(async () => {
  await client?.close();
  backend.closeAllConnections();
  await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()));
});

describe('Skill 工具矩阵的真实 stdio 调用', () => {
  it('44 项人工样例覆盖全部运行时工具、21 个只读工具、23 个写工具和每个产品组合', async () => {
    const { tools } = await client.listTools();
    const names = fixture.cases.map(tool => tool.name);
    expect(new Set(names).size).toBe(44);
    expect([...names].sort()).toEqual(tools.map(tool => tool.name).sort());
    expect([...names].sort()).toEqual(spec.map(tool => tool.name).sort());
    expect(fixture.cases.filter(tool => tool.method === 'GET')).toHaveLength(21);
    expect(fixture.cases.filter(tool => tool.method === 'POST')).toHaveLength(23);
    let combinations = 0;
    for (const tool of fixture.cases) {
      const definition = spec.find(item => item.name === tool.name)!;
      const exposed = tools.find(item => item.name === tool.name)!;
      expect(exposed.annotations?.readOnlyHint, tool.name).toBe(tool.method === 'GET');
      expect(definition.readOnly, tool.name).toBe(tool.method === 'GET');
      // spec 只用于检查漏项；参数、路由、展开字段和响应预期均来自人工 fixture。
      expect(Object.keys(tool.products ?? {}).sort(), tool.name)
        .toEqual(Object.keys(definition.products ?? {}).sort());
      const schema = exposed.inputSchema.properties as Record<string, unknown>;
      expect(Object.hasOwn(schema, 'confirm_token'), tool.name).toBe(tool.method === 'POST');
      combinations += tool.products ? Object.keys(tool.products).length : 1;
    }
    expect(combinations).toBe(115);
  });

  for (const tool of fixture.cases) {
    const products = tool.products ? Object.keys(tool.products) : [undefined];
    for (const product of products) {
      const variant = variantOf(tool, product);
      const label = product ?? tool.fixedProduct ?? '通用';
      it(`${tool.name} / ${label}：参数、路由、产品展开与业务结果一致`, async () => {
        if (tool.method === 'GET') {
          await readOnce(variant);
        } else {
          const pending = await requestPreview(variant);
          const result = await executeConfirmed(pending, '用户明确同意');
          expect(result.isError).toBeFalsy();
          expect(JSON.parse(textOf(result))).toEqual(variant.expected);
        }
        expect(replies).toHaveLength(0);
      }, 10_000);
    }
  }
});

describe('Skill 多步操作与失败结果边界', () => {
  it.each([2, 3])('期限流量拒绝不支持的期限 %i，SDK 校验失败且不请求后端', async billTimelen => {
    const purchase = sample('order_buy_dynamic', 'dynamic-monthly');
    const result = await client.callTool({
      name: purchase.tool.name,
      arguments: { ...purchase.args, bill_timelen: billTimelen },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('allowed values');
    expect(textOf(result)).not.toContain('confirm_token=');
    expect(hits).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });

  it('修改备注缺少 remark 时由 SDK 拒绝，不进入确认或请求后端', async () => {
    const result = await client.callTool({
      name: 'sub_account_update',
      arguments: { product: 'dynamic-no-expiry', id: '101' },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('required');
    expect(textOf(result)).toContain('remark');
    expect(textOf(result)).not.toContain('confirm_token=');
    expect(hits).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });

  it('读取账号价和余额、查询优惠券，将返回的券 ID 放入 conpon_id 后确认下单', async () => {
    const price = await readOnce(sample('user_price'));
    const balance = await readOnce(sample('user_balance'));
    const coupon = await readOnce(sample('coupon_list'));
    expect(price.data).toMatchObject({ dynamic: [{ num: 10, price: '25.00' }] });
    expect(balance.data).toBe('3347.42');
    const coupons = coupon.data as { conpon_id: number }[];
    const purchase = sample('order_buy_dynamic', 'dynamic-no-expiry');
    purchase.args.conpon_id = coupons[0].conpon_id;
    expect(purchase.args.conpon_id).toBe(73);
    const pending = await requestPreview(purchase);
    const result = await executeConfirmed(pending, '用户明确同意');
    expect(JSON.parse(textOf(result))).toEqual(purchase.expected);
    expect(hits).toHaveLength(4);
    expect(new URLSearchParams(hits[3].body).get('conpon_id')).toBe('73');
    expect(new URLSearchParams(hits[3].body).has('coupon_id')).toBe(false);
  });

  it('动态带宽列表使用业务编号续费 30 天，不能把本地记录 id 当作 sub_account_id', async () => {
    const list = await readOnce(sample('sub_account_list', 'dynamic-bandwidth'));
    const rows = (list.data as { rows: { id: number; sub_account: number; can_renew: boolean }[] }).rows;
    expect(rows[0]).toMatchObject({ id: 52, sub_account: 901, can_renew: true });
    const renewal = sample('order_renew_dynamic_bandwidth');
    renewal.args.sub_account_id = String(rows[0].sub_account);
    expect(renewal.args.sub_account_id).not.toBe(String(rows[0].id));
    expect(renewal.args.timelen).toBe(1);
    // 网站核费在本测试中由已知模拟费用代替，不假装存在该产品的报价工具。
    const verifiedWebsitePrice = { amount: '80.00', conpon_id: 74 };
    expect(verifiedWebsitePrice.amount).toBe('80.00');
    const pending = await requestPreview(renewal);
    const result = await executeConfirmed(pending, '用户明确同意');
    expect(JSON.parse(textOf(result))).toMatchObject({ data: { sub_account: 901, pay_money: verifiedWebsitePrice.amount } });
    expect(hits).toHaveLength(2);
    expect(new URLSearchParams(hits[1].body).get('sub_account_id')).toBe('901');
  });

  it('删除接口即使 code=1，业务失败 msg 仍完整可见，不以 isError=false 宣称删除完成', async () => {
    const pending = await requestPreview(sample('sub_account_delete', 'dynamic-no-expiry'));
    const failure = { code: 1, msg: '删除失败：该账号仍有正在使用的连接', data: { deleted: [], failed: ['101'] } };
    const result = await executeConfirmed(pending, '用户明确同意', { body: failure });
    // MCP 当前保留 code=1 的成功标记；调用方仍必须核对 msg 和实际业务结果。
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual(failure);
    expect(textOf(result)).toContain('删除失败');
    expect(hits).toHaveLength(1);
  });

  it('扣费业务失败只发送一次请求，确认码已经消费，重新使用也不能重复扣费', async () => {
    const pending = await requestPreview(sample('order_buy_dynamic', 'dynamic-no-expiry'));
    const result = await executeConfirmed(pending, '用户明确同意', {
      body: { code: 0, msg: '余额不足，未创建订单', data: { required: '20.00', available: '1.00' } },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('余额不足');
    expect(textOf(result)).toContain('"available":"1.00"');
    await delay(100);
    expect(hits).toHaveLength(1);
    const reused = await client.callTool({
      name: pending.variant.tool.name,
      arguments: { ...pending.variant.args, confirm_token: pending.token },
    });
    expect(reused.isError).toBe(true);
    expect(textOf(reused)).toContain('确认码无效或已过期');
    expect(hits).toHaveLength(1);
  });

  it('扣费请求发送后连接中断保留失败信息，不自动重发或把未知结果报告为成功', async () => {
    const pending = await requestPreview(sample('order_renew_dynamic_bandwidth'));
    const result = await executeConfirmed(pending, '用户明确同意', { disconnect: true });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('/externalapi/set_meal/renewOrder');
    expect(textOf(result)).toContain('失败');
    await delay(100);
    expect(hits).toHaveLength(1);
    expect(replies).toHaveLength(0);
  });

  it('没有模拟用户同意时停在预览，等待不会产生写请求', async () => {
    const pending = await requestPreview(sample('order_refund_dynamic_bandwidth_apply'));
    expect(pending.token).toBeTruthy();
    await delay(100);
    expect(hits).toHaveLength(0);
    expect(replies).toHaveLength(0);
  });
});
