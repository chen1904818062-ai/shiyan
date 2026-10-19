# 拾言 v1.1.0

新增 Resend 邮箱验证码、腾讯云 +86 手机验证码及账号数据隔离。公开登录默认关闭，请先完成 [账号配置和原空间绑定](deploy/ACCOUNT_SETUP.md)，再开放给其他用户。

一个适合手机和电脑使用的私人网页：创建话题，粘贴来自 ChatGPT、豆包、DeepSeek 等平台的对话，保存完整原文，并在配置模型后生成有出处的详细总结和每周回顾。报告用简短概览开头，正文保留具体方法、步骤、原文例子和适用条件。

详细使用说明、模型配置、本地运行和验证步骤见 [中文开发文档](README.zh-CN.md)。

Render + Turso 个人版部署，以及之后腾讯云迁移的配置见 [独立部署说明](deploy/README.md)。独立运行构建使用 `npm run build:standalone`。

技术实现：React / TypeScript / Vinext；Sites 使用 Cloudflare D1，独立版使用 Render + Turso。支持 DeepSeek、智谱 GLM、通义千问和 Kimi。输入密钥后由服务端访问对应平台的 `/models`，展示接口返回的文本模型，多个型号由用户选择，单个自动填入。目录不等同于已验证调用权限；平台不支持目录时明确提示，可按平台控制台手动填写，不静默换型号。

报告分别记录请求型号与接口返回型号，型号不一致、接口未返回型号、旧报告未核验都会明确显示。新元数据保存在原有报告 JSON 中，无须改变数据库表结构，备份和旧报告仍兼容。旧总结不会自动重写，需手动重新整理。

```powershell
npm run install:ci
npm run build
node --test tests/summary.test.mjs tests/model-config.test.mjs tests/model-catalog.test.mjs tests/standalone.test.mjs
```

首次本地运行须按中文文档初始化数据库。没有模型 API Key 时，创建话题、保存原文和查看明确标注的示例仍可用，真实总结需配置密钥后生成。

版本功能与使用范围见 [发布说明](CHANGELOG.md)。
