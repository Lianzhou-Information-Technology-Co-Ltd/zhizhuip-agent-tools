# MCP 工具与业务流程覆盖表

本表覆盖当前 44 个工具：21 个查询工具、23 个写工具。先按任务读取对应流程，再以当前会话 schema 填参。工具覆盖意味着已有使用步骤和核对方法，不意味着后端所有接口均已接入、所有业务都有可调用的报价或状态复核工具。

产品缩写：D=两种动态流量；S=三种静态住宅 IPv4；V=静态 IPv6；C=数据中心；B=动态带宽；A=全部八种。通用工具无 `product`。专用 V/B 写工具也不传 `product`。表中后端入口均相对 `/externalapi/`，对应后端 `application/externalapi/controller`；参数映射由 MCP 完成，不按本表绕过 MCP 直调 HTTP。

## 查询工具

| 工具 | 产品 | 后端入口 | 使用流程与关键核对 |
| --- | --- | --- | --- |
| `user_info` | 通用 | `user/getGetUserInfo` | [账号查询](account-usage.md#查询顺序)：总余额已含充值与赠送，不重复相加。 |
| `user_balance` | 通用 | `user/getGetUserInfo` | [账号查询](account-usage.md#查询顺序)：派生 `money`，`data` 为金额字符串，不是对象。 |
| `user_price` | 通用 | `tool/getUserCustomPriceInfo` | [形成方案](purchase-renewal.md#查询并形成操作方案)：使用客户价与实际整单档位，B/测试价/升级差价不能由它推定。 |
| `official_price` | 通用 | `tool/getOriginCustomPriceInfo` | [形成方案](purchase-renewal.md#查询并形成操作方案)：官网标价，有缓存；不替代客户成交价。 |
| `coupon_list` | 通用 | `conpons/conponList` | [优惠券](purchase-renewal.md#优惠券与期限参数)：用 `type/status`，返回 `conpon_id`；V 不支持，B 需网站核实。 |
| `country_list` | D/S/V/C | `common/countryList` | [地区查询](products.md#地区与资源池查询)：保留 ID、名称、编码的对应关系。 |
| `state_list` | D | `common/stateList` | [地区查询](products.md#地区与资源池查询)：用同产品国家 ID 查州；不跨国家复用。 |
| `city_list` | D/S/V/C | `common/cityList` | [地区查询](products.md#地区与资源池查询)：D 先查州；写操作使用返回名称，不能直接填数字 ID。 |
| `provider_list` | D | `device/providerList` | [资源池](products.md#地区与资源池查询)：编号字符串数组；后端固定永久主账号，不能保证期限产品适用。 |
| `sub_account_list` | A | `device/accountList` | [查询顺序](account-usage.md#查询顺序)、[代理连接](proxy-connection.md#账号与入口)：正确分页；B 后续用 `sub_account`，连接信息缺失则停止生成。 |
| `flow_package_list` | D | `device/userSetMeal` | [用量查询](account-usage.md#用量单位与日期)：已购套餐分页，不是购买新套餐。 |
| `main_account_flow` | D | `total/userFlowTotal` | [用量查询](account-usage.md#用量单位与日期)：主账号 `use/base/total` 单位 GB，分别查两种流量。 |
| `sub_account_flow` | D | `total/subAccountFlow` | [用量查询](account-usage.md#用量单位与日期)：每日 MB、最多 30 天；不累加重叠日期或资源池全部值。 |
| `main_account_switch_token` | D | `device/userListEnabled` | [账号查询](account-usage.md)：首次读取可能生成并保存 token，仅用户明确需要时读；不是换 IP 工具。 |
| `sub_account_limit_flow` | D | `tool/accountLimitFlowDetail` | [流量上限](account-lifecycle.md#流量上限)：用 `account` 查当前周期、上限及已用量。 |
| `sub_account_limit_flow_batch` | D | `tool/accountLimitFlowBatchDetail` | [流量上限](account-lifecycle.md#流量上限)：`accounts` 逗号字符串，按页覆盖目标集合。 |
| `sub_account_whitelist` | D | `tool/getSubAccountWhiteList` | [白名单](account-lifecycle.md#账密端口和白名单)：仅查询，没有对应写工具。 |
| `bandwidth_package_list` | S | `bandwidth/getBandwidthList` | [静态带宽升级](purchase-renewal.md#静态带宽升级)：按国家查档位，不是个人升级差价。 |
| `bandwidth_detail` | S | `bandwidth/bandwidthNumDetail` | [静态带宽升级](purchase-renewal.md#静态带宽升级)：`subAccount` 字符串，120 秒缓存，谨慎复核。 |
| `bandwidth_trend` | S | `bandwidth/monitoringTrend` | [用量查询](account-usage.md#用量单位与日期)：实时或历史，历史秒级时间戳，最多 31 天。 |
| `ip_range_status` | S | `inventory_status/ipStrStatus` | [库存](products.md#地区与资源池查询)：注意 `pageSize`、城市名称及 IP 段；不承诺未来库存。 |

## 写工具

全部先确认再执行；确认码不是业务成功。下表的完成核对是在实际收到业务响应之后进行，超时等结果未知时按[问题排查](troubleshooting.md)处理。

| 工具 | 产品 | 后端入口 | 使用流程与关键核对 |
| --- | --- | --- | --- |
| `sub_account_add` | D | `device/accountAdd` | [新增](account-lifecycle.md#新增动态流量子账号)：已购流量、地区、1–120 分钟；新增与限流不是原子步骤。 |
| `sub_account_update` | D | `device/accountUpdate` | [配置副作用](account-lifecycle.md#备注间隔和限流的配置副作用)：单改备注可能重置协议等配置，不能保证窄更新。 |
| `sub_account_update_batch` | D | `device/accountUpdateList` | [配置副作用](account-lifecycle.md#备注间隔和限流的配置副作用)：批量备注/间隔，`ids` 逗号字符串，检查实际影响。 |
| `sub_account_set_limit_flow` | D | `tool/accountLimitFlowSet` | [限流](account-lifecycle.md#流量上限)：`0` 删除限制；先说明默认配置副作用，写后重新查。 |
| `sub_account_set_limit_flow_batch` | D | `tool/accountLimitFlowBatchSet` | [限流](account-lifecycle.md#流量上限)：同周期、每账号独立 GB 上限；检查失败数量和原限制是否丢失。 |
| `sub_account_set_credentials` | D/S/V/C | `device/batchUpdateSubAccountUsernamePassword` | [账密](account-lifecycle.md#账密端口和白名单)：同时覆盖用户名和密码；结果按目标逐项核对。 |
| `sub_account_set_password_batch` | S/C | `device/batchUpdateSubAccountPassword` | [账密](account-lifecycle.md#账密端口和白名单)：只适用于已有自定义账密；不自动改用户名。 |
| `sub_account_toggle_port` | S | `device/portEnableUpdateList` | [端口](account-lifecycle.md#账密端口和白名单)：最多 200 个、0 关 1 开；提示连接影响并复核。 |
| `sub_account_delete` | D | `device/accountDelete` | [删除](account-lifecycle.md#删除动态流量子账号)：不可恢复，读 `msg`；code=1 的未找到信息不等于本次成功删除。 |
| `sub_account_delete_batch` | D | `device/accountDeleteList` | [删除](account-lifecycle.md#删除动态流量子账号)：明确具体目标，核对每项结果及查询范围。 |
| `order_buy_dynamic` | D | `product_order/createProductOrder` | [购买](purchase-renewal.md#先确定产品与操作对象)：1–5000 GB，期限仅 30 天，核实整单档位与券。 |
| `order_buy_time_ip` | S/C | `product_order/createProductOrder` | [购买](purchase-renewal.md#优惠券与期限参数)：S 最多 300、C 最多 50；C 无 7 天新购，分段数量和为 num。 |
| `order_buy_ipv6` | V | `product_order/createIpv6Order` | [IPv6 购买](purchase-renewal.md#优惠券与期限参数)：最多 5000，有 7 天购买档，无优惠券。 |
| `order_buy_test_ip` | S/C | `product_order/createTestOrder` | [测试 IP](purchase-renewal.md#测试-ip-与缺货预约)：实际扣费、占月额度、期限由配置决定；先核实测试价与剩余额度。 |
| `order_renew` | S/C | `set_meal/renewOrder` | [续费](purchase-renewal.md#查询并形成操作方案)：按国家分组、总数最多 200；明确是否连带宽续费。 |
| `order_renew_ipv6` | V | `set_meal/renewOrderIpv6` | [IPv6 续费](purchase-renewal.md#优惠券与期限参数)：不支持 7 天和券，核对账号到期时间。 |
| `order_bandwidth_upgrade` | S | `product_order/bandwidthUpgradeOrder` | [静态升级](purchase-renewal.md#静态带宽升级)：目标总带宽、已过期先续费；目录价不能代替差价。 |
| `order_refund_apply` | S | `product_order/createOrderBack` | [退单](purchase-renewal.md#根据结果结束或继续核对)：1 天资格及续费/升级状态限制，提交审核不代表退款到账。 |
| `ip_booking` | S/C | `product_order/bookingIPArea` | [预约](purchase-renewal.md#测试-ip-与缺货预约)：国家名称、1–1000 个；只登记需求，无进度查询能力。 |
| `order_buy_dynamic_bandwidth` | B | `product_order/createProductOrder` | [动态带宽](purchase-renewal.md#动态带宽的能力边界)：一个子账号、US/DE/SG、至少 10 Mbps，先网站核实价格。 |
| `order_renew_dynamic_bandwidth` | B | `set_meal/renewOrder` | [动态带宽](purchase-renewal.md#动态带宽的能力边界)：`rows[].sub_account`、can_renew，期限 1/2/3=30/90/180 天。 |
| `order_dynamic_bandwidth_upgrade` | B | `product_order/dynamicBandwidthUpgradeOrder` | [动态带宽](purchase-renewal.md#动态带宽的能力边界)：can_upgrade、目标总 Mbps 高于当前；先核实报价。 |
| `order_refund_dynamic_bandwidth_apply` | B | `product_order/createOrderBack` | [退单](purchase-renewal.md#根据结果结束或继续核对)：业务账号编号及原因，检查 refunding，提交后待审核。 |

## 未暴露能力的处理

- 精确升级试算、动态带宽续费试算及动态带宽订单详情在后端存在，但本版 MCP 未暴露；需要网站核实，不能自行拼接接口调用。
- 没有立即换 IP、预约进度、白名单写入、独立测试 IP 报价/额度工具；不得用名称相近工具替代。
- 修改配置的上游默认行为属于后端限制。本版校正说明和决策流程，没有宣称已修复后端或保证线上状态。
- 完整工具调用样例及覆盖检查见仓库 `test/evals/` 和测试；本 Skill 不附真实凭证，也不通过执行任意脚本绕过 MCP。
