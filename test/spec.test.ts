import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate, loadPages } from '../scripts/build-spec.js';
import { PRODUCT_KEYS, placePages } from '../scripts/lib/merge.js';

const tools = generate();
const byName = (n: string) => {
  const t = tools.find(x => x.name === n);
  if (!t) throw new Error(`没有工具 ${n}`);
  return t;
};
const DYNAMIC = ['dynamic-no-expiry', 'dynamic-monthly'];
const STATIC3 = ['static-standard', 'static-native', 'static-isp-native'];
const PRODUCT_PARAMS = ['type', 'status', 'native', 'version', 'is_month', 'product_type_id'];

describe('spec/tools.json', () => {
  it('恰好 44 个工具，21 个只读，名字与设计文档一致', () => {
    expect(tools.map(t => t.name)).toEqual([
      'bandwidth_detail', 'bandwidth_package_list', 'bandwidth_trend',
      'city_list', 'country_list', 'coupon_list', 'flow_package_list', 'ip_booking', 'ip_range_status',
      'main_account_flow', 'main_account_switch_token', 'official_price',
      'order_bandwidth_upgrade', 'order_buy_dynamic', 'order_buy_dynamic_bandwidth', 'order_buy_ipv6', 'order_buy_test_ip', 'order_buy_time_ip',
      'order_dynamic_bandwidth_upgrade', 'order_refund_apply', 'order_refund_dynamic_bandwidth_apply',
      'order_renew', 'order_renew_dynamic_bandwidth', 'order_renew_ipv6', 'provider_list', 'state_list',
      'sub_account_add', 'sub_account_delete', 'sub_account_delete_batch', 'sub_account_flow',
      'sub_account_limit_flow', 'sub_account_limit_flow_batch', 'sub_account_list', 'sub_account_set_credentials',
      'sub_account_set_limit_flow', 'sub_account_set_limit_flow_batch', 'sub_account_set_password_batch',
      'sub_account_toggle_port', 'sub_account_update', 'sub_account_update_batch',
      'sub_account_whitelist', 'user_balance', 'user_info', 'user_price',
    ]);
    expect(tools.filter(t => t.readOnly)).toHaveLength(21);
    for (const t of tools) expect(t.inputSchema.additionalProperties, t.name).toBe(false);
  });

  it('只读 GET、其余 POST；删除与扣费带 destructive，描述首句写明后果', () => {
    for (const t of tools) expect(t.method, t.name).toBe(t.readOnly ? 'GET' : 'POST');
    expect(tools.filter(t => t.destructive).map(t => t.name)).toEqual([
      'order_bandwidth_upgrade', 'order_buy_dynamic', 'order_buy_dynamic_bandwidth', 'order_buy_ipv6', 'order_buy_test_ip', 'order_buy_time_ip',
      'order_dynamic_bandwidth_upgrade', 'order_renew', 'order_renew_dynamic_bandwidth', 'order_renew_ipv6', 'sub_account_delete', 'sub_account_delete_batch',
    ]);
    for (const t of tools.filter(x => x.destructive)) expect(t.description, t.name).toMatch(/^(会从账户余额扣费|不可恢复|会消耗)/);
    for (const t of tools.filter(x => !x.destructive)) expect(t.description, t.name).not.toMatch(/^(会从账户余额扣费|不可恢复)/);
  });

  it('产品参数不进 schema，换成 product 枚举与展开表；access_token 一律剔除', () => {
    for (const t of tools) {
      expect(t.inputSchema.properties.access_token, t.name).toBeUndefined();
      if (t.name === 'coupon_list') continue; // 优惠券列表没有产品，type/status 是筛选条件
      for (const k of PRODUCT_PARAMS) expect(t.inputSchema.properties[k], `${t.name}.${k}`).toBeUndefined();
    }
    expect(byName('coupon_list').inputSchema.properties.type.enum).toEqual([0, 1, 2]);
    expect(byName('coupon_list').products).toBeUndefined();

    const list = byName('sub_account_list');
    expect(list.inputSchema.properties.product.enum).toEqual(PRODUCT_KEYS);
    expect(list.inputSchema.required[0]).toBe('product');
    expect(list.products?.datacenter).toEqual({ type: 2, status: 1 });
    expect(list.products?.['dynamic-no-expiry']).toEqual({ type: 0, status: 0, is_month: 0 });
    expect(list.products?.['static-ipv6']).toEqual({ type: 1, status: 1, native: 1, version: 6 });
    expect(byName('bandwidth_trend').inputSchema.properties.product.enum).toEqual(STATIC3);
    expect(byName('state_list').inputSchema.properties.product.enum).toEqual(DYNAMIC);
    expect(byName('sub_account_set_password_batch').inputSchema.properties.product.enum).toEqual([...STATIC3, 'datacenter']);

    for (const name of ['order_buy_ipv6', 'order_renew_ipv6']) {
      expect(byName(name).inputSchema.properties.product, name).toBeUndefined();
      expect(byName(name).products, name).toBeUndefined();
      expect(byName(name).fixed, name).toEqual({ type: 1, status: 1, native: 1, version: 6 });
    }
    for (const t of tools) if (t.products) expect(t.fixed, t.name).toBeUndefined();
  });

  it('购买接口按产品拆成三个工具', () => {
    const dyn = byName('order_buy_dynamic');
    expect(dyn.inputSchema.properties.product.enum).toEqual(DYNAMIC);
    expect(Object.keys(dyn.inputSchema.properties).sort()).toEqual(['bill_timelen', 'conpon_id', 'num', 'product']);
    expect(dyn.inputSchema.required).toEqual(['product', 'num']);
    expect(dyn.inputSchema.properties.bill_timelen.enum).toEqual([1]);
    expect(dyn.inputSchema.properties.bill_timelen.description).toMatch(/dynamic-monthly.*省略默认/);
    expect(dyn.inputSchema.properties.bill_timelen.description).toMatch(/dynamic-no-expiry 不要传/);

    const ip = byName('order_buy_time_ip');
    expect(ip.inputSchema.properties.product.enum).toEqual([...STATIC3, 'datacenter']);
    expect([...ip.inputSchema.required].sort()).toEqual(['agree', 'country', 'num', 'product', 'timelen']);
    expect(ip.inputSchema.properties.specifyIps).toMatchObject({
      type: 'array',
      items: { type: 'object', properties: { ipStr: { type: 'string' }, count: { type: 'integer' } } },
    });
    expect(ip.inputSchema.properties.timelen.enum).toEqual([0, 1, 2, 3, 4]);
    expect(ip.inputSchema.properties.agree.enum).toEqual(['SOCKS5', 'HTTP', 'HTTPS']);
    expect(ip.inputSchema.properties.country.description).toMatch(/ISO 3166-1/);
  });

  it('括号参数转成结构化参数', () => {
    const cred = byName('sub_account_set_credentials');
    expect(cred.inputSchema.properties.product.enum).toEqual(PRODUCT_KEYS.filter(k => k !== 'dynamic-bandwidth'));
    expect(cred.inputSchema.properties.content).toMatchObject({ type: 'array', items: { type: 'object', required: ['id', 'customUsername', 'customPassword'] } });
    expect(cred.inputSchema.properties.content.items?.properties?.id.type).toBe('string');
    expect(cred.inputSchema.required).toEqual(['product', 'content']);

    const renew = byName('order_renew');
    expect(renew.inputSchema.required).toEqual(['product', 'content']);
    expect(renew.inputSchema.properties.content.items?.properties?.ids).toMatchObject({ type: 'array', items: { type: 'string' } });
    expect([...(renew.inputSchema.properties.content.items?.required ?? [])].sort()).toEqual(['country', 'ids', 'timelen']);
    expect(renew.inputSchema.properties.content.items?.properties?.timelen.enum).toEqual([0, 1, 2, 3, 4]);

    expect(byName('order_bandwidth_upgrade').inputSchema.properties.sub_accounts).toMatchObject({ type: 'array', items: { type: 'string' } });
    expect([...byName('order_bandwidth_upgrade').inputSchema.required].sort()).toEqual(['bandwidth_num', 'product', 'sub_accounts']);
    expect(byName('sub_account_set_limit_flow_batch').inputSchema.properties.accounts.items?.properties?.account.type).toBe('string');
    expect(byName('sub_account_list').inputSchema.properties.searchArr).toMatchObject({ type: 'array', items: { type: 'string' } });
  });

  it('子账号列表覆盖全部产品，pagesize 注明上限，动态与时长类的搜索参数都在', () => {
    const list = byName('sub_account_list');
    expect(list.inputSchema.required).toEqual(['product', 'page', 'pagesize']);
    expect(list.inputSchema.properties.pagesize.description).toMatch(/100/);
    expect(list.inputSchema.properties.subAccounts).toBeUndefined(); // 文档站 2026-09-26 已把动态页的 subAccounts 改成后端真正读的 ids
    expect(list.inputSchema.properties.ids.type).toBe('string');
    expect(list.inputSchema.properties.ids.description).not.toMatch(/时长类产品用/);
    expect(list.inputSchema.properties.search_type).toMatchObject({ type: 'integer', enum: [0, 1, 2] });
  });

  it('文档缺陷兜底生效', () => {
    const refund = byName('order_refund_apply');
    expect(refund.inputSchema.properties.remark.type).toBe('string');
    expect(refund.inputSchema.properties.id.type).toBe('string');
    expect([...refund.inputSchema.required].sort()).toEqual(['id', 'product', 'remark']);

    expect(byName('ip_range_status').inputSchema.properties.page.type).toBe('integer');
    expect(byName('ip_range_status').inputSchema.properties.pageSize.type).toBe('integer');
    expect(byName('sub_account_limit_flow_batch').inputSchema.properties.accounts.type).toBe('string');

    expect(byName('sub_account_whitelist').inputSchema.properties.product.enum).toEqual(DYNAMIC);
    expect(byName('sub_account_whitelist').inputSchema.required).toEqual(['product', 'id']);
    expect(tools.find(t => t.name === 'sub_account_set_whitelist')).toBeUndefined(); // 传空 ip_list 等于清空白名单，用户决定不暴露
    expect(byName('sub_account_delete').inputSchema.required).toEqual(['product', 'id']);
    expect(byName('sub_account_limit_flow_batch').defaults).toEqual({ page: 1, pagesize: 100 });
    expect(byName('sub_account_toggle_port').inputSchema.required).toEqual(['product', 'ids', 'use_ip_port']);

    expect(byName('ip_booking').inputSchema.properties.country.description).toMatch(/名称/);
    expect(byName('ip_booking').inputSchema.properties.country.description).not.toMatch(/ISO/);

    expect(byName('sub_account_limit_flow_batch').inputSchema.properties.page.description).toMatch(/页码/);
    expect(byName('order_buy_time_ip').inputSchema.properties.num.description).toMatch(/1 到 300(?!0)/);
    expect(byName('order_buy_time_ip').description).not.toMatch(/不传默认/);
  });

  it('后端核对第二轮：限流必填与周期 5、测试 IP 上限 100、IPv6 续费无优惠券', () => {
    const one = byName('sub_account_set_limit_flow');
    expect(one.inputSchema.required).toEqual(['product', 'account', 'cycle', 'limit_flow']);
    expect(one.inputSchema.properties.cycle).toMatchObject({ type: 'integer', enum: [0, 1, 2, 3, 4, 5] });
    expect(one.inputSchema.properties.limit_flow.type).toBe('integer');
    expect(one.inputSchema.properties.limit_flow.description).toMatch(/0 表示删除/);

    const batch = byName('sub_account_set_limit_flow_batch');
    expect(batch.inputSchema.required).toEqual(['product', 'cycle', 'accounts']);
    expect(batch.inputSchema.properties.cycle).toMatchObject({ type: 'integer', enum: [0, 1, 2, 3, 4, 5] });
    expect([...(batch.inputSchema.properties.accounts.items?.required ?? [])].sort()).toEqual(['account', 'limit_flow']);
    expect(batch.inputSchema.properties.accounts.items?.properties?.limit_flow.type).toBe('integer');

    expect(byName('order_buy_test_ip').inputSchema.properties.num.description).toMatch(/1-100/);
    expect(byName('order_renew_ipv6').inputSchema.properties.conpon_id).toBeUndefined();
  });

  it('后端核对第三轮：新增子账号的必填与默认协议、名称类参数、几处描述补充', () => {
    const add = byName('sub_account_add');
    expect(add.inputSchema.required).toEqual(['product', 'num', 'changeInterval', 'country']);
    expect(add.defaults).toEqual({ agree: 'SOCKS5' });
    expect(add.inputSchema.properties.agree.description).toMatch(/不传默认 SOCKS5/);
    expect(add.inputSchema.properties.agree.description).not.toMatch(/下必填/);
    expect(add.inputSchema.properties.num.description).toMatch(/1 到 500/);
    expect(add.inputSchema.properties.changeInterval.description).toMatch(/1 到 120/);
    expect(add.inputSchema.properties.state.description).toMatch(/名称/);
    expect(add.inputSchema.properties.city.description).toMatch(/名称/);
    expect(add.inputSchema.properties.spec).toMatchObject({ type: 'integer' });
    expect(add.inputSchema.properties.spec.description).toMatch(/一个/);

    expect(byName('ip_range_status').inputSchema.properties.city_code.description).toMatch(/名称与编码相同/);
    expect(byName('sub_account_list').inputSchema.properties.searchArr.description).toMatch(/search_type=1/);
    expect(byName('order_refund_apply').description).toMatch(/1 天内/);
    expect(byName('order_buy_time_ip').inputSchema.properties.specifyIps.description).toMatch(/之和必须等于 num/);
    expect(byName('order_renew').inputSchema.properties.content.items?.properties?.country.description).toMatch(/以.*记录的国家为准/);
  });

  it('子账号 id 类参数一律 string，数组元素与嵌套对象里的也是', () => {
    const ID_KEYS = ['id', 'ids', 'subAccount', 'subAccounts', 'account', 'accounts', 'sub_accounts', 'sub_account_id'];
    const check = (name: string, props: Record<string, { type?: string; items?: { type?: string; properties?: Record<string, { type?: string }> } }>) => {
      for (const [k, v] of Object.entries(props)) {
        if (!ID_KEYS.includes(k)) continue;
        if (v.type === 'array') {
          if (v.items?.type === 'object') expect(v.items.properties?.id?.type ?? 'string', `${name}.${k}[].id`).toBe('string');
          else expect(v.items?.type, `${name}.${k}[]`).toBe('string');
        } else {
          expect(v.type, `${name}.${k}`).toBe('string');
        }
      }
    };
    for (const t of tools) {
      check(t.name, t.inputSchema.properties);
      for (const [k, v] of Object.entries(t.inputSchema.properties)) {
        if (v.type === 'array' && v.items?.type === 'object' && v.items.properties) check(`${t.name}.${k}[]`, v.items.properties);
      }
    }
  });

  it('schema 节点只含合法关键字（overrides 的 YAML 流式映射里写了英文逗号会多出乱码键）', () => {
    const ALLOWED = new Set(['type', 'description', 'enum', 'items', 'properties', 'required', 'additionalProperties']);
    const walk = (node: Record<string, unknown>, where: string): void => {
      for (const k of Object.keys(node)) expect(ALLOWED.has(k), `${where} 含非法关键字 ${k}`).toBe(true);
      const items = node.items as Record<string, unknown> | undefined;
      if (items) walk(items, `${where}[]`);
      const props = node.properties as Record<string, Record<string, unknown>> | undefined;
      if (props) for (const [k, v] of Object.entries(props)) walk(v, `${where}.${k}`);
    };
    for (const t of tools) walk(t.inputSchema as unknown as Record<string, unknown>, t.name);
    expect(byName('sub_account_add').inputSchema.properties.country.description).toMatch(/US,JP；可选国家用 country_list 查/);
    expect(byName('sub_account_add').inputSchema.properties.country.description).not.toMatch(/如 US。/);
  });

  it('下单与续费工具的 conpon_id 都是 integer，与 coupon_list 返回的 conpon_id 一致；IPv6 购买与续费都没有这个参数', () => {
    for (const n of ['order_buy_dynamic', 'order_buy_time_ip', 'order_renew']) {
      expect(byName(n).inputSchema.properties.conpon_id.type, n).toBe('integer');
    }
    for (const n of ['order_buy_ipv6', 'order_renew_ipv6']) expect(byName(n).inputSchema.properties.conpon_id, n).toBeUndefined();
  });

  it('后端核对第四轮：IPv6 续费不能选 7 天而购买可以、测试 IP 会扣余额', () => {
    const renewTimelen = byName('order_renew_ipv6').inputSchema.properties.content.items?.properties?.timelen;
    expect(renewTimelen?.enum).toEqual([1, 2, 3, 4]);
    expect(renewTimelen?.description).not.toMatch(/0=7天/);
    expect(byName('order_buy_ipv6').inputSchema.properties.timelen.enum).toEqual([0, 1, 2, 3, 4]);
    expect(byName('order_buy_test_ip').description).toMatch(/余额/);
  });

  it('按文档站统一：国家与州省编码不写二选一、子账号 id 类描述写清、分页上限照文档、购买前提与改密前提', () => {
    expect(byName('state_list').inputSchema.properties.country_code.description).not.toMatch(/二选一/);
    const city = byName('city_list').inputSchema.properties;
    expect(city.country_code.description).not.toMatch(/二选一/);
    expect(city.state_code.description).not.toMatch(/二选一/);

    expect(byName('bandwidth_detail').inputSchema.properties.subAccount.description).toMatch(/子账号 ?id/);
    for (const n of ['order_renew', 'order_renew_ipv6']) {
      const ids = byName(n).inputSchema.properties.content.items?.properties?.ids;
      expect(ids?.items?.description, n).toMatch(/子账号 ?id/);
      expect(ids?.items?.description, n).not.toMatch(/产品/);
    }
    expect(byName('order_bandwidth_upgrade').inputSchema.properties.sub_accounts.items?.description).toMatch(/子账号 ?id/);

    expect(byName('flow_package_list').inputSchema.properties.pagesize.description).toBe('每页显示数量');

    expect(byName('sub_account_set_password_batch').description).toMatch(/自定义用户名/);
    for (const n of ['order_buy_dynamic', 'order_buy_time_ip', 'order_buy_ipv6', 'order_buy_test_ip']) {
      expect(byName(n).description, n).toMatch(/实名验证/);
    }
  });

  it('跟上文档站补的后端限制：带宽升级与开关端口单次 200 个、升级填目标带宽、过期要先续费、流量单位 MB', () => {
    const up = byName('order_bandwidth_upgrade');
    expect(up.description).toMatch(/先续费/);
    expect(up.inputSchema.properties.sub_accounts.description).toMatch(/200/);
    expect(up.inputSchema.properties.bandwidth_num.description).toMatch(/大于子账号当前带宽/);
    expect(byName('sub_account_toggle_port').inputSchema.properties.ids.description).toMatch(/200/);
    expect(byName('sub_account_flow').description).toMatch(/MB/);
  });

  it('spec/tools.json 与当前生成结果一致（改了 overrides 要重新 npm run build-spec）', () => {
    expect(JSON.parse(readFileSync(new URL('../spec/tools.json', import.meta.url), 'utf8'))).toEqual(tools);
  });

  it('spec/pages 的目录与文件名符合 placePages 规则（sync-docs 按同一规则落盘，不要手动改名）', () => {
    const pages = loadPages();
    expect(pages).toHaveLength(115);
    for (const [file, p] of placePages(pages)) expect(file, p.id).toBe(`${p.id}.md`);
  });

  it('动态带宽独立写工具固定 product_type_id=11，不混入旧产品参数', () => {
    const names = ['order_buy_dynamic_bandwidth', 'order_renew_dynamic_bandwidth', 'order_dynamic_bandwidth_upgrade', 'order_refund_dynamic_bandwidth_apply'];
    for (const name of names) {
      const t = byName(name);
      expect(t.fixed, name).toEqual({ product_type_id: 11 });
      expect(t.readOnly, name).toBe(false);
      expect(t.inputSchema.properties.product, name).toBeUndefined();
      expect(t.inputSchema.properties.content, name).toBeUndefined();
      expect(t.inputSchema.properties['conpon_id '], name).toBeUndefined();
    }
    expect(byName('sub_account_list').products?.['dynamic-bandwidth']).toEqual({ product_type_id: 11 });
    const buy = byName(names[0]);
    expect(buy.inputSchema.required).toEqual(['country', 'timelen', 'bandwidth_num']);
    expect(buy.inputSchema.properties.country.enum).toEqual(['US', 'DE', 'SG']);
    expect(buy.inputSchema.properties.timelen.enum).toEqual([1, 2, 3]);
    expect(buy.inputSchema.properties.conpon_id.type).toBe('integer');
    expect(byName(names[1]).inputSchema.required).toEqual(['sub_account_id', 'timelen']);
    expect(byName(names[1]).inputSchema.properties.timelen.enum).toEqual([1, 2, 3]);
    expect(byName(names[2]).inputSchema.required).toEqual(['sub_account_id', 'bandwidth_num']);
    expect(byName(names[3]).inputSchema.required).toEqual(['sub_account_id', 'remark']);
    expect(byName(names[3]).destructive).toBe(false);
    for (const name of names.slice(1)) {
      const id = byName(name).inputSchema.properties.sub_account_id;
      expect(id.type).toBe('string');
      expect(id.description).toContain('rows[].sub_account');
    }
    for (const t of tools.filter(t => t.products && t.name !== 'sub_account_list')) {
      expect(t.products?.['dynamic-bandwidth'], t.name).toBeUndefined();
    }
  });

  it('完整快照', () => {
    expect(tools).toMatchSnapshot();
  });
});
