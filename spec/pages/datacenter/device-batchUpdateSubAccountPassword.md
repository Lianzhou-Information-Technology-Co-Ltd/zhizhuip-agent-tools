# 批量修改数据中心时长IP子账号密码

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /externalapi/device/batchUpdateSubAccountPassword:
    put:
      summary: 批量修改数据中心时长IP子账号密码
      deprecated: false
      description: 数据中心IP子账号用户名和密码。前提条件是用户已设置了自定义用户名和密码。系统默认的用户名和密码无法修改
      tags:
        - 用户IP子账号管理/数据中心时长子账号
      parameters: []
      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties:
                access_token:
                  description: >-
                    用户api key。<a href="/9518263m0" target="_blank">api
                    key获取方式</a>
                  example: '{{access_token}}'
                  type: string
                type:
                  description: 套餐类型：0=全球动态住宅，1=全球静态住宅，2=全球数据中心。<b>此处固定为：2</b>
                  example: 2
                  type: integer
                status:
                  description: 计费模式：0=按流量，1=按时长，2=按ip数。<b>此处固定为：1</b>
                  example: 1
                  type: integer
                content[0][id]:
                  description: 子账号id。
                  example: '38979'
                  type: string
                content[0][customPassword]:
                  description: 自定义密码。只能是大小字母和数字。长度8-30个字符之间
                  example: "demoPassword1"
                  type: string
                content[1][id]:
                  description: 子账号id。
                  example: '38978'
                  type: string
                content[1][customPassword]:
                  description: 自定义密码。只能是字母和数字。长度8-30个字符之间
                  example: passwordxxx3
                  type: string
              required:
                - access_token
                - type
                - status
                - content[0][id]
                - content[0][customPassword]
            examples: {}
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
                    type: 'null'
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
                msg: 修改成功！
                time: '2005-03-27 13:48:34'
                data: null
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 用户IP子账号管理/数据中心时长子账号
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3406922/apis/api-284818047-run
components:
  schemas: {}
  securitySchemes: {}
servers:
  - url: https://www.zhizhuip.cc
    description: 正式环境
security: []

```
