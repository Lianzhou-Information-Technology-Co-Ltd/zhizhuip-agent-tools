# 获取子账号列表

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /externalapi/device/accountList:
    get:
      summary: 获取子账号列表
      deprecated: false
      description: 获取动态住宅不限流量子账号列表
      tags:
        - 用户IP子账号管理/动态住宅不限流量
      parameters:
        - name: access_token
          in: query
          description: 用户api key。<a href="/9518263m0" target="_blank">api key获取方式</a>
          required: false
          example: '{{access_token}}'
          schema:
            type: string
        - name: product_type_id
          in: query
          description: 产品id，当前产品固定：11
          required: true
          example: 11
          schema:
            type: integer
        - name: page
          in: query
          description: 当前页
          required: false
          example: 1
          schema:
            type: integer
        - name: pagesize
          in: query
          description: 每页默认条数，最大100
          required: false
          example: 10
          schema:
            type: integer
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
                  msg:
                    type: string
                  time:
                    type: string
                  data:
                    type: object
                    properties:
                      total:
                        type: integer
                      rows:
                        type: array
                        items:
                          type: object
                          properties:
                            id:
                              type: integer
                            sub_account:
                              type: integer
                            username:
                              type: string
                            password:
                              type: string
                            protocol:
                              type: string
                            port:
                              type: integer
                            target:
                              type: string
                            disabled:
                              type: boolean
                            country:
                              type: string
                            bandwidth_num:
                              type: integer
                            start_time:
                              type: integer
                            end_time:
                              type: integer
                            status:
                              type: integer
                            status_text:
                              type: string
                            expire_tag:
                              type: string
                            refunding:
                              type: boolean
                            can_renew:
                              type: boolean
                            can_upgrade:
                              type: boolean
                            remark:
                              type: string
                          required:
                            - id
                            - sub_account
                            - username
                            - password
                            - protocol
                            - port
                            - target
                            - disabled
                            - country
                            - bandwidth_num
                            - start_time
                            - end_time
                            - status
                            - status_text
                            - expire_tag
                            - refunding
                            - can_renew
                            - can_upgrade
                            - remark
                    required:
                      - total
                      - rows
                required:
                  - code
                  - msg
                  - time
                  - data
              example:
                code: 1
                msg: 获取成功
                time: '1791604890'
                data:
                  total: 1
                  rows:
                    - id: 1
                      sub_account: 1
                      username: "demo_user"
                      password: xxxxxx
                      protocol: SOCKS5
                      port: 5001
                      target: 127.0.0.1
                      disabled: false
                      country: US
                      bandwidth_num: 5
                      start_time: 1789895041
                      end_time: 1789898641
                      status: 0
                      status_text: 生效
                      expire_tag: 即将过期
                      refunding: false
                      can_renew: false
                      can_upgrade: false
                      remark: '1111'
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 用户IP子账号管理/动态住宅不限流量
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3406922/apis/api-520399290-run
components:
  schemas: {}
  securitySchemes: {}
servers:
  - url: https://www.zhizhuip.cc
    description: 正式环境
security: []

```
