# 子账号白名单设置

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /externalapi/tool/setSubAccountWhiteList:
    put:
      summary: 子账号白名单设置
      deprecated: false
      description: ''
      tags:
        - 用户IP子账号管理/动态住宅流量子账号(永久)
      parameters:
        - name: token
          in: header
          description: 用户api key。<a href="/9518263m0" target="_blank">api key获取方式</a>
          required: false
          example: '{{access_token}}'
          schema:
            type: string
      requestBody:
        content:
          application/x-www-form-urlencoded:
            schema:
              type: object
              properties:
                type:
                  type: integer
                  description: 套餐类型：0=全球动态住宅，1=全球静态住宅，2=全球数据中心。此处固定为：0
                  example: 0
                status:
                  type: integer
                  description: 计费模式：0=按流量，1=按时长，2=按ip数。<b>此处固定为：0</b>
                  example: 0
                is_month:
                  type: integer
                  description: 流量是否限时:0=永久,1=期限<b>此处固定为：0</b>
                  example: 0
                id:
                  type: integer
                  description: 子账号id
                  example: 1
                ip_list:
                  description: 白名单列表,多个以英文逗号分隔
                  example: "192.0.2.1,192.0.2.2"
                  type: string
              required:
                - type
                - status
                - is_month
            examples: {}
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 用户IP子账号管理/动态住宅流量子账号(永久)
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3406922/apis/api-358416282-run
components:
  schemas: {}
  securitySchemes: {}
servers:
  - url: https://www.zhizhuip.cc
    description: 正式环境
security: []

```
