import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../scripts/build-spec.js';
import { callApi, expandArgs } from '../src/http.js';
import type { ToolDef } from '../src/types.js';

const tools = generate();
const byName = (name: string): ToolDef => {
  const found = tools.find(item => item.name === name);
  if (!found) throw new Error(`没有工具 ${name}`);
  return found;
};
const cfg = { baseUrl: 'http://127.0.0.1:1', token: 'test-key', timeoutMs: 1000, confirmQuietMs: 0 };
const textOf = (result: { content: unknown[] }): string => (result.content[0] as { text: string }).text;
const fakeFetch = (data: unknown, msg = '获取成功!') =>
  (() => Promise.resolve(new Response(JSON.stringify({ code: 1, msg, data }), { status: 200 }))) as typeof fetch;

describe('当前后端契约', () => {
  it('保持现有工具范围，不把后端尚未暴露的报价和订单详情当成工具', () => {
    expect(tools).toHaveLength(44);
    expect(tools.filter(item => item.readOnly)).toHaveLength(21);
    for (const path of ['/externalapi/set_meal/bandwidthUpgradePrice', '/externalapi/set_meal/renewPrice', '/externalapi/product_order/getProductOrderDetails']) {
      expect(tools.some(item => item.path === path), path).toBe(false);
    }
  });

  it('优惠券沿用后端 conpon_id 字段，不依赖不存在的 id', async () => {
    const coupon = { conpon_id: 27, con_name: '测试券', time_ip_remaining: 2, flow_remaining: 0 };
    const result = await callApi(byName('coupon_list'), { type: 1, status: 1 }, cfg, fakeFetch([coupon]));
    const body = JSON.parse(textOf(result));
    expect(body.data).toEqual([coupon]);
    expect(body.data[0].id).toBeUndefined();
    const args = expandArgs(byName('order_buy_time_ip'), {
      product: 'static-standard', num: 1, country: 'US', agree: 'SOCKS5', timelen: 1, conpon_id: body.data[0].conpon_id,
    });
    expect(args?.conpon_id).toBe(27);
    expect(byName('coupon_list').description).toContain('返回的 conpon_id');
    for (const name of ['order_buy_dynamic', 'order_buy_time_ip', 'order_renew']) {
      expect(byName(name).inputSchema.properties.conpon_id.description, name).toContain('返回的 conpon_id');
    }
  });

  it('资源池返回字符串数组，期限产品参数不能改变已知的后端查询来源', async () => {
    const tool = byName('provider_list');
    const result = await callApi(tool, { product: 'dynamic-monthly' }, cfg, fakeFetch(['4', '284']));
    expect(JSON.parse(textOf(result)).data).toEqual(['4', '284']);
    expect(expandArgs(tool, { product: 'dynamic-monthly' })?.is_month).toBe(1);
    expect(tool.description).toContain('字符串数组');
    expect(tool.description).toContain('始终读取永久流量主账号');
    for (const name of ['sub_account_add', 'sub_account_flow']) {
      expect(byName(name).inputSchema.properties.spec.description, name).toContain('转为整数');
    }
  });

  it('动态限时只支持三十天，省略时长与永久产品的参数仍可正常展开', () => {
    const buy = byName('order_buy_dynamic');
    expect(buy.inputSchema.properties.bill_timelen.enum).toEqual([1]);
    expect(buy.inputSchema.required).not.toContain('bill_timelen');
    expect(buy.inputSchema.properties.num.type).toBe('integer');
    expect(buy.inputSchema.properties.num.description).toContain('1 到 5000');
    expect(expandArgs(buy, { product: 'dynamic-monthly', num: 10 })).toMatchObject({ is_month: 1, num: 10 });
    expect(expandArgs(buy, { product: 'dynamic-no-expiry', num: 10 })?.bill_timelen).toBeUndefined();
    expect(byName('sub_account_add').inputSchema.properties.changeInterval.description).toContain('1 到 120');
  });

  it('窄更新说明不掩盖后端默认连接配置，备注单改必须有修改内容', () => {
    expect(byName('sub_account_update').inputSchema.required).toContain('remark');
    for (const name of [
      'sub_account_update', 'sub_account_update_batch', 'sub_account_set_credentials', 'sub_account_set_password_batch',
      'sub_account_set_limit_flow', 'sub_account_set_limit_flow_batch',
    ]) {
      const description = byName(name).description;
      expect(description, name).toContain('SOCKS5');
      expect(description, name).toContain('udp=false');
      expect(description, name).toContain('failover=false');
      expect(description, name).toContain('同意');
    }
    expect(byName('sub_account_set_limit_flow_batch').description).toContain('原限流记录也可能被删除');
  });

  it('批量限流部分失败不会丢失失败明细，也不被概括为全部成功', async () => {
    const data = { success_count: 1, fail_count: 1, total_count: 2, fail_messages: ['子账号 102 设置失败: 上游不可用'] };
    const result = await callApi(byName('sub_account_set_limit_flow_batch'), {
      product: 'dynamic-no-expiry', cycle: 0,
      accounts: [{ account: '101', limit_flow: 5 }, { account: '102', limit_flow: 8 }],
    }, cfg, fakeFetch(data, '批量设置完成'));
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(textOf(result))).toEqual({ code: 1, msg: '批量设置完成', data });
    expect(byName('sub_account_set_limit_flow_batch').description).toContain('fail_count');
  });

  it('删除未找到账号的特殊成功响应保留失败消息供调用方判断', async () => {
    const result = await callApi(byName('sub_account_delete'), { product: 'dynamic-no-expiry', id: '101' }, cfg,
      fakeFetch(null, '删除失败!未查询到子账号'));
    expect(JSON.parse(textOf(result))).toEqual({ code: 1, msg: '删除失败!未查询到子账号', data: null });
    expect(byName('sub_account_delete').description).toContain('结合 msg');
  });

  it('限流查询保留空数组与平面分页结果，单条和批量的后端数值上限分开说明', async () => {
    const result = await callApi(byName('sub_account_limit_flow'), { product: 'dynamic-monthly', account: '101' }, cfg, fakeFetch([]));
    expect(JSON.parse(textOf(result)).data).toEqual([]);
    expect(byName('sub_account_limit_flow').description).toContain('不代表账号不存在');
    expect(byName('sub_account_limit_flow_batch').description).toContain('不是带 total/rows');
    expect(byName('sub_account_set_limit_flow').inputSchema.properties.limit_flow.description).toContain('0 到 100000000');
    expect(byName('sub_account_set_limit_flow_batch').inputSchema.properties.accounts.items?.properties?.limit_flow.description).toContain('0 到 1000000');
  });

  it('测试购买的配置期限与额度边界、升级的准确报价缺口、预约提交状态均写明', () => {
    const testBuy = byName('order_buy_test_ip').description;
    expect(testBuy).toContain('有效期由平台配置决定');
    expect(testBuy).toContain('大于或等于剩余额度');
    expect(testBuy).toContain('已删除的本月测试账号仍占额度');
    expect(byName('order_bandwidth_upgrade').description).toContain('不能把套餐价格当作升级报价');
    expect(byName('ip_booking').description).toContain('仅表示预约需求已提交');
    expect(byName('main_account_switch_token').description).toContain('生成并保存');
  });

  it('Session 示例包含请求时长且不承诺创建子账号、独立出口或固定入口', () => {
    const resource = readFileSync(new URL('../spec/dynamic-proxy-session.md', import.meta.url), 'utf8');
    expect(resource).toContain('-ss-sessionA-tm-20m');
    expect(resource).toContain('不会因为改变 `ss` 就创建一个新的平台子账号');
    expect(resource).toContain('不保证得到不同的出口 IP');
    expect(resource).toContain('<查询返回的 target>');
    expect(resource).not.toContain('proxy.zhizhuip.com:5001');
    expect(resource).not.toContain('P95');
  });
});
