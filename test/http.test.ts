import { describe, expect, it } from 'vitest';
import { callApi, cfgFromEnv, expandArgs } from '../src/http.js';
import type { ToolDef } from '../src/types.js';

const cfg = { baseUrl: 'https://example.test', token: 'sk-secret-xyz', timeoutMs: 1000, confirmQuietMs: 0 };

const tool = (over: Partial<ToolDef> = {}): ToolDef => ({
  name: 't', title: 't', description: '', readOnly: true, destructive: false,
  method: 'GET', path: '/externalapi/user/getGetUserInfo',
  inputSchema: { type: 'object', properties: { ids: { type: 'string' }, page: { type: 'integer' } }, required: [], additionalProperties: false },
  ...over,
});
const PRODUCTS = { 'static-native': { type: 1, status: 1, native: 1 }, datacenter: { type: 2, status: 1 } };

type Seen = { url?: string; init?: RequestInit };
const stub = (status: number, body: string, seen: Seen = {}) =>
  ((input: string | URL | Request, init?: RequestInit) => {
    seen.url = String(input);
    seen.init = init;
    return Promise.resolve(new Response(body, { status }));
  }) as typeof fetch;

const textOf = (r: { content: unknown[] }) => (r.content[0] as { text: string }).text;

describe('cfgFromEnv', () => {
  it('去掉 token 首尾空白和 baseUrl 末尾斜杠，超时默认 30000', () => {
    expect(cfgFromEnv({ ZHIZHUIP_TOKEN: ' sk-abc \n', ZHIZHUIP_BASE_URL: 'https://x.test/' }))
      .toEqual({ baseUrl: 'https://x.test', token: 'sk-abc', timeoutMs: 30000, confirmQuietMs: 10000 });
  });
  it('超时与静默期设成空串时视为未设置，用默认值', () => {
    expect(cfgFromEnv({ ZHIZHUIP_TOKEN: 'sk-abc', ZHIZHUIP_TIMEOUT_MS: '', ZHIZHUIP_CONFIRM_QUIET_MS: ' ' })).toMatchObject({ timeoutMs: 30000, confirmQuietMs: 10000 });
  });
  it('静默期可以设 0，负数或非数字报错', () => {
    expect(cfgFromEnv({ ZHIZHUIP_TOKEN: 'sk-abc', ZHIZHUIP_CONFIRM_QUIET_MS: '0' }).confirmQuietMs).toBe(0);
    expect(() => cfgFromEnv({ ZHIZHUIP_TOKEN: 'sk-abc', ZHIZHUIP_CONFIRM_QUIET_MS: '-1' })).toThrow(/ZHIZHUIP_CONFIRM_QUIET_MS/);
    expect(() => cfgFromEnv({ ZHIZHUIP_TOKEN: 'sk-abc', ZHIZHUIP_CONFIRM_QUIET_MS: 'abc' })).toThrow(/ZHIZHUIP_CONFIRM_QUIET_MS/);
  });
  it('不传 baseUrl 用正式环境域名', () => {
    expect(cfgFromEnv({ ZHIZHUIP_TOKEN: 'sk-abc' }).baseUrl).toBe('https://www.zhizhuip.cc');
  });
  it('缺 token 抛出带提示的错误，并说明统一安装与手工配置入口', () => {
    expect(() => cfgFromEnv({})).toThrow(/ZHIZHUIP_TOKEN/);
    expect(() => cfgFromEnv({})).toThrow(/API Keys/);
    expect(() => cfgFromEnv({})).toThrow(/-e ZHIZHUIP_TOKEN/);
  });
  it('超时不是正整数时报错', () => {
    expect(() => cfgFromEnv({ ZHIZHUIP_TOKEN: 'sk-abc', ZHIZHUIP_TIMEOUT_MS: 'abc' })).toThrow(/ZHIZHUIP_TIMEOUT_MS/);
    expect(() => cfgFromEnv({ ZHIZHUIP_TOKEN: 'sk-abc', ZHIZHUIP_TIMEOUT_MS: '0' })).toThrow(/ZHIZHUIP_TIMEOUT_MS/);
  });
});

describe('expandArgs', () => {
  it('product 展开成后端参数，放在其余参数之后，最后是 fixed 与 is_mcp_send', () => {
    expect(expandArgs(tool({ products: PRODUCTS, fixed: { pay: 'balance' } }), { product: 'static-native', page: 1 }))
      .toEqual({ page: 1, type: 1, status: 1, native: 1, pay: 'balance', is_mcp_send: 1 });
  });
  it('单产品工具没有 product 参数，组合在 fixed 里', () => {
    expect(expandArgs(tool({ fixed: { type: 1, status: 1, native: 1, version: 6 } }), { num: 2 }))
      .toEqual({ num: 2, type: 1, status: 1, native: 1, version: 6, is_mcp_send: 1 });
  });
  it('product 不在表里返回 undefined', () => {
    expect(expandArgs(tool({ products: PRODUCTS }), { product: 'nope' })).toBeUndefined();
    expect(expandArgs(tool({ products: PRODUCTS }), {})).toBeUndefined();
  });
  it('没有 products 也没有 fixed 时只加 is_mcp_send', () => {
    expect(expandArgs(tool(), { page: 3 })).toEqual({ page: 3, is_mcp_send: 1 });
  });
  it('defaults 在没传的参数上补默认值，传了以传的为准', () => {
    const t = tool({ defaults: { page: 1, pagesize: 100 } });
    expect(expandArgs(t, { accounts: '1,2' })).toEqual({ page: 1, pagesize: 100, accounts: '1,2', is_mcp_send: 1 });
    expect(expandArgs(t, { page: 3, accounts: '1,2' })).toEqual({ page: 3, pagesize: 100, accounts: '1,2', is_mcp_send: 1 });
  });
  it('product 是原型链上的名字（constructor）也当不在表里', () => {
    expect(expandArgs(tool({ products: PRODUCTS }), { product: 'constructor' })).toBeUndefined();
  });
});

describe('callApi', () => {
  it('GET 把展开后的参数放 query，token 与 UA 放 header，code=1 返回 {code,msg,data}', async () => {
    const seen: Seen = {};
    const r = await callApi(tool({ products: PRODUCTS }), { product: 'datacenter', page: 1 }, cfg,
      stub(200, JSON.stringify({ code: 1, msg: 'ok', time: '1', data: { total: 9 } }), seen));
    expect(seen.url).toBe('https://example.test/externalapi/user/getGetUserInfo?page=1&type=2&status=1&is_mcp_send=1');
    expect((seen.init?.headers as Record<string, string>).token).toBe('sk-secret-xyz');
    expect((seen.init?.headers as Record<string, string>)['user-agent']).toBe('zhizhuip mcp');
    expect((seen.init?.headers as Record<string, string>)['accept-language']).toBe('zh-CN');
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(textOf(r))).toEqual({ code: 1, msg: 'ok', data: { total: 9 } });
  });

  it('product 不合法时直接报错，不请求后端', async () => {
    const seen: Seen = {};
    const r = await callApi(tool({ products: PRODUCTS }), { product: 'nope' }, cfg, stub(200, '{"code":1}', seen));
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('static-native');
    expect(seen.url).toBeUndefined();
  });

  it('带 pick 的派生工具只返回 data 里的那个字段，缺字段时为 null', async () => {
    const t = tool({ pick: 'money' });
    const r = await callApi(t, {}, cfg, stub(200, JSON.stringify({ code: 1, msg: 'ok', data: { money: '3347.42', give_money: '54.19' } })));
    expect(JSON.parse(textOf(r))).toEqual({ code: 1, msg: 'ok', data: '3347.42' });
    const r2 = await callApi(t, {}, cfg, stub(200, JSON.stringify({ code: 1, msg: 'ok', data: [] })));
    expect(JSON.parse(textOf(r2))).toEqual({ code: 1, msg: 'ok', data: null });
  });

  it('POST 用表单编码，展开括号参数并附加 fixed 与 is_mcp_send=1', async () => {
    const seen: Seen = {};
    await callApi(tool({ method: 'POST', fixed: { type: 1, status: 1, native: 1, version: 6 } }), { content: [{ ids: ['77'], country: 'US' }] }, cfg,
      stub(200, '{"code":1,"msg":"","data":null}', seen));
    expect(seen.init?.method).toBe('POST');
    expect((seen.init?.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    expect(decodeURIComponent(String(seen.init?.body))).toBe('content[0][ids][0]=77&content[0][country]=US&type=1&status=1&native=1&version=6&is_mcp_send=1');
    expect(seen.url).toBe('https://example.test/externalapi/user/getGetUserInfo');
  });

  it('code=0 是业务错误：isError 且文本为 msg，有 data 时附上', async () => {
    const r = await callApi(tool(), {}, cfg, stub(200, '{"code":0,"msg":"数据中心单笔不能超出50个","data":null}'));
    expect(r.isError).toBe(true);
    expect(textOf(r)).toBe('数据中心单笔不能超出50个');
    const r2 = await callApi(tool(), {}, cfg, stub(200, '{"code":0,"msg":"失败","data":{"id":1}}'));
    expect(textOf(r2)).toBe('失败\n{"id":1}');
  });

  it('code 为字符串 "1" 也算成功，返回时归一为数字', async () => {
    const r = await callApi(tool(), {}, cfg, stub(200, '{"code":"1","msg":"ok","data":[]}'));
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(textOf(r))).toEqual({ code: 1, msg: 'ok', data: [] });
  });

  it('HTTP 401、code 401、code 403 都提示 API Key 无效，且不回显 token', async () => {
    for (const [status, body] of [[401, '{"code":401,"msg":"API Key 无效或已删除","data":null}'], [200, '{"code":401,"msg":"Please login first","data":null}'], [200, '{"code":403,"msg":"x","data":null}'], [401, '{"code":0,"msg":"Unauthorized","data":null}']] as const) {
      const r = await callApi(tool(), {}, cfg, stub(status, body));
      expect(r.isError).toBe(true);
      expect(textOf(r)).toMatch(/API Key 无效/);
      expect(textOf(r)).toContain('ZHIZHUIP_TOKEN');
      expect(textOf(r)).not.toContain('sk-secret-xyz');
    }
  });

  it('HTTP 401 但正文不是 JSON（前置网关拦截）时同样提示 API Key 无效', async () => {
    const r = await callApi(tool(), {}, cfg, stub(401, '<html>Unauthorized</html>'));
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/API Key 无效/);
    expect(textOf(r)).not.toContain('sk-secret-xyz');
  });

  it('限流提示附带 300 次与带宽 60 次的说明', async () => {
    const r = await callApi(tool(), {}, cfg, stub(200, '{"code":0,"msg":"访问频繁,请稍后再试!","data":null}'));
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/300/);
    expect(textOf(r)).toMatch(/60/);
  });

  it('非 JSON、JSON null、5xx 带 JSON 体都返回状态码与正文片段', async () => {
    for (const [status, body] of [[502, '<html>Bad Gateway</html>'], [200, 'null'], [502, '{"error":"upstream unavailable"}']] as const) {
      const r = await callApi(tool(), {}, cfg, stub(status, body));
      expect(r.isError).toBe(true);
      expect(textOf(r)).toMatch(new RegExp(`^HTTP ${status}`));
      expect(textOf(r)).toContain(body.slice(0, 20));
    }
  });

  it('网络异常映射为 isError，带出底层 cause', async () => {
    const boom = (() => Promise.reject(Object.assign(new TypeError('fetch failed'), { cause: new Error('ECONNREFUSED 127.0.0.1:9') }))) as unknown as typeof fetch;
    const r = await callApi(tool(), {}, cfg, boom);
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('fetch failed');
    expect(textOf(r)).toContain('ECONNREFUSED 127.0.0.1:9');
  });

  it('超时时说明超过了多少毫秒', async () => {
    const slow = (() => Promise.reject(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))) as unknown as typeof fetch;
    const r = await callApi(tool(), {}, cfg, slow);
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('1000');
  });
});
