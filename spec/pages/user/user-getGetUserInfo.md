# 获取用户信息

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /externalapi/user/getGetUserInfo:
    get:
      summary: 获取用户信息
      deprecated: false
      description: 接口目前只支持账号密码登录,不支持验证码登录。
      tags:
        - 用户管理
      parameters:
        - name: access_token
          in: query
          description: 用户api key。<a href="/9518263m0" target="_blank">api key获取方式</a>
          required: true
          example: '{{access_token}}'
          schema:
            type: string
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: 响应编码:1=正常,0=错误
                  msg:
                    type: string
                    description: 响应说明
                  time:
                    type: string
                  data:
                    type: object
                    properties:
                      id:
                        type: integer
                      username:
                        type: string
                        description: 用户名
                      nickname:
                        type: string
                        description: 昵称
                      email:
                        type: string
                        description: 用户邮箱
                      mobile:
                        type: string
                        description: 手机号
                      email_verify:
                        type: integer
                        description: 邮件是否验证。0=未验证，1=已验证
                      mobile_verify:
                        type: integer
                        description: 手机号码是否验证。0=未验证，1=已验证
                      avatar:
                        type: string
                        description: 头像
                      duties:
                        type: 'null'
                      gender:
                        type: integer
                      purpose:
                        type: 'null'
                      money:
                        type: string
                        description: 账户余额
                      score:
                        type: integer
                        description: 账户积分
                      extension_status:
                        type: integer
                        description: 推广状态：0=未激活，1=审核中，2=激活成功，3=激活失败
                      verify_status:
                        type: string
                        description: 验证状态：0=未实名认证，1=已通过支付宝扫码实名认证
                      owner_verify_status:
                        type: string
                        description: 企业认证：0=未认证，1=已认证
                      ref:
                        type: string
                        description: 推广链接
                      channel:
                        type: string
                        description: 推广方式：0=用户推广，1=渠道推广
                      origin_money:
                        type: string
                      give_money:
                        type: string
                      token:
                        type: string
                        description: 登录token
                    required:
                      - id
                      - username
                      - nickname
                      - email
                      - mobile
                      - email_verify
                      - mobile_verify
                      - avatar
                      - duties
                      - gender
                      - purpose
                      - money
                      - score
                      - extension_status
                      - verify_status
                      - owner_verify_status
                      - ref
                      - channel
                      - origin_money
                      - give_money
                      - token
                    x-apifox-orders:
                      - id
                      - username
                      - nickname
                      - email
                      - mobile
                      - email_verify
                      - mobile_verify
                      - avatar
                      - duties
                      - gender
                      - purpose
                      - money
                      - score
                      - extension_status
                      - verify_status
                      - owner_verify_status
                      - ref
                      - channel
                      - origin_money
                      - give_money
                      - token
                x-apifox-orders:
                  - code
                  - msg
                  - time
                  - data
                required:
                  - code
                  - msg
                  - time
                  - data
              example:
                code: 1
                msg: 获取成功
                time: '1697528176'
                data:
                  id: 1
                  username: userxxxx
                  nickname: demo_name
                  email: "demo@example.invalid"
                  mobile: ''
                  email_verify: 1
                  mobile_verify: 0
                  avatar: data:image/svg+xml;base64,xxxxxxxx
                  duties: null
                  gender: 0
                  purpose: null
                  money: '3347.42'
                  score: 2195
                  extension_status: 2
                  verify_status: '1'
                  owner_verify_status: '0'
                  ref: "https://example.invalid/?ref=demo"
                  channel: '1'
                  origin_money: '3293.23'
                  give_money: '54.19'
                  token: xxx-xxx-xxx-xxx-xxx
                  user_id: 1
                  createtime: 1697512606
                  expiretime: 1700104606
                  expires_in: 2576430
                  ref_status: 渠道推广
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 用户管理
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3406922/apis/api-116480658-run
components:
  schemas: {}
  securitySchemes: {}
servers:
  - url: https://www.zhizhuip.cc
    description: 正式环境
security: []

```
