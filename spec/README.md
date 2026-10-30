# 接口来源与当前 MCP 契约

`pages/` 保存下载的上游接口文档，供生成器和维护者追溯来源。它们包含旧说明、示例和原始 HTTP 参数，不能直接作为客户调用指南。客户从 [Skill](../skills/zhizhuip/SKILL.md) 和 [使用说明](../USAGE.md) 开始，调用时以运行中的 MCP 工具 schema 为准。

## 各文件的职责

| 位置 | 用途与维护方式 |
| --- | --- |
| [pages/](pages/) | 上游接口快照，保留接口定义与原始说明；涉及账号、凭证和联系信息的示例使用演示数据。来源与差异在本文件集中说明。 |
| [overrides.yaml](overrides.yaml) | 人工校正工具名称、产品范围、参数、描述、读写属性、拆分及忽略规则。已核实的文档缺陷在这里修正。 |
| [tools.json](tools.json) | 由本地快照与 overrides 生成，MCP 运行时读取的工具定义。不要手工编辑。运行时还会按配置过滤只读工具，并为写工具加入确认参数。 |
| [dynamic-proxy-session.md](dynamic-proxy-session.md) | 人工维护的现行 Session 资源，说明如何依据实际子账号字段生成连接配置。它不经过 tools.json 生成链路。 |
| `source/dynamic-proxy-session.md` | 执行文档同步时保存的 Session 上游原文，仅供比较，不作为运行时资源；未执行同步时该文件可能尚不存在。 |
| [工具覆盖表](../skills/zhizhuip/references/tool-map.md) | 当前工具对应的业务流程、产品和 HTTP 接口。源码里存在一个接口，不代表当前 MCP 已暴露它。 |

当前快照共有 115 页，包含 41 个不同的 HTTP 路径，分布于 8 个产品目录及 `tool`、`user` 两个通用目录。经过忽略、合并、拆分和派生规则后，生成 44 个 MCP 工具，数量不与源页面一一对应。

## 生成与同步

```text
文档站 llms.txt
  → scripts/sync-docs.ts 下载接口页
  → spec/pages/<分组>/<控制器>-<方法>.md
  → scripts/lib/merge.ts 解析 OpenAPI，合并产品并应用 overrides.yaml
  → scripts/build-spec.ts 生成 tools.json
  → MCP 注册工具；Skill 引导业务流程

文档站 Session 原文
  → spec/source/dynamic-proxy-session.md
  → 维护者核对差异与实际能力
  → 人工更新 spec/dynamic-proxy-session.md 及相关 Skill
```

`npm run build-spec` 只使用本地文件，不下载文档。`npm run sync-docs` 会联网下载并重新生成工具定义，需作为明确的维护操作执行；同步 Session 原文不会覆盖人工校正后的现行资源。

解析器只读取页面中的第一个 YAML 代码块。公开快照保留接口路径、参数、类型、默认值和说明，示例值经过公开化处理；来源与目录说明集中放在本文件，不要放入 `pages/`，因为该目录中的 Markdown 都会进入解析器。页面路径由同步脚本决定，不手动改名。

原文中的 `type/status/native/version/is_month` 等参数会转换为 MCP 产品选项；部分 ID 转为字符串，PHP 方括号参数转为对象或数组，鉴权由客户端配置提供。不能把原文参数和示例直接复制进工具调用，也不能把快照里被忽略的接口当作可用工具。

## 源文档与 MCP 的主要差异

源文档中的部分描述与 MCP 当前支持的规则不同。以下差异已通过 overrides 和 Skill 表达；调用时使用工具 schema 和对应产品说明，不直接照搬快照示例。

| 类别 | 需要遵守的现行说明 |
| --- | --- |
| 动态流量购买数量与期限。 | 原文数量仍为 1–300 GB，期限页仍列 30/90/180 天；当前 MCP 采用 1–5000 整数 GB，期限流量只接受 30 天。该期限约束不套用到动态不限流量产品。 |
| 新增动态子账号。 | 原文切换间隔写 5–120 分钟，现行校正为 1–120 分钟；响应中 username/password 的中文标签也有互换，字段语义以当前工具说明为准。 |
| 测试 IP。 | 原文写默认 1 天，部分页面还写额度用完转余额购买。测试订单本身会扣余额，时长取平台配置，额度不足会拒绝，不能承诺免费或自动转为普通购买。 |
| 备注、账密与限流修改。 | 原文只说明目标字段，未说明部分后端调用会向上游补发协议、切换周期、UDP、去重和故障转移等默认配置。按工具对应的产品差异说明副作用；不能承诺窄更新会保留所有连接配置。 |
| 主账号流量结果。 | 原文 schema 仍写 time/flow 和 MB，示例却是 use/base/total；当前说明按 use/base/total 和 GB 解读。 |
| 资源池与主账号切换 token。 | 资源池查询实际读取永久流量主账号配置，期限产品选择不改变来源；切换 token 在缺失时可能生成并保存，不能视为无副作用查询或已完成换 IP。 |
| 限流及删除结果。 | 无限流配置可能返回空数组；批量限流已有成功/失败计数字段，但快照未说明失败可能删除旧配置。删除结果要结合 msg 与复查，不能仅凭 code=1 宣称全部成功，也不承诺批量原子性。 |
| 预约及静态带宽升级。 | 预约只登记需求，不表示锁库存或完成交付；套餐单价不能代替现有账号的升级差额，当前 MCP 没有对应的精确升级试算工具。 |
| 动态不限流量业务编号。 | sub_account_id 取列表 rows[].sub_account，不能误用本地记录 id；当前 MCP 也没有该产品的完整报价与订单详情工具。 |
| 复制遗留说明。 | 端口开关的 description 误写成修改账密，用户信息页误写成登录说明；以当前工具职责为准。 |

优惠券源页已经使用 `conpon_id`，资源池源页也已经声明字符串数组；旧 MCP 描述中的错误已在 overrides 修正，不能误记成源页字段错误。批量限流查询源页已经是数组，批量设置源页也已经包含 `success_count/fail_count/total_count`，需要补的是边界和失败语义。白名单设置、清空两份源页被生成规则忽略，保留快照不代表工具可调用。

例如可对照 [期限流量购买源页](pages/dynamic-monthly/product_order-createProductOrder.md)、[测试 IP 源页](pages/static-standard/product_order-createTestOrder.md)、[主账号流量源页](pages/dynamic-no-expiry/total-userFlowTotal.md) 与 [人工校正规则](overrides.yaml)。价格、库存、账号权限和实际返回应通过当前可用工具核实。

## 修订流程

同步文档后，提交前检查新增或变化的示例：账号、密码、token、邮箱、推广链接和代理地址应使用明确的演示值、保留域名或文档专用地址，不包含实际用户数据。仅替换示例值，保留类型与格式；不要把真实凭证作为测试数据提交。

发现接口差异后，先核对现行服务行为、MCP 转换和工具支持范围，再修改 overrides；影响用户决策的限制同步到 Skill。接口定义的校正放在 overrides，不通过修改快照 schema 或 tools.json 实现。

生成后检查工具差异、产品范围、参数与读写属性，并运行相关契约和流程测试。修改 Session 资源时，另外核对资源读取及 Skill 中的连接配置流程，不用源文档的固定入口或性能描述替代实际账号信息。
