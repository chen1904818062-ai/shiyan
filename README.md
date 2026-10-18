# 拾言 · 对话整理 Agent

一个适合手机和电脑使用的私人网页：创建话题，粘贴来自 ChatGPT、豆包、DeepSeek 等平台的对话，保存完整原文，并在配置模型后生成有出处的精简总结和每周回顾。

详细使用说明、模型配置、本地运行和验证步骤见 [中文开发文档](README.zh-CN.md)。

Render + Turso 海外测试版，以及之后腾讯云迁移的配置见 [独立部署说明](deploy/README.md)。独立运行构建使用 `npm run build:standalone`。

技术实现：React / TypeScript / Vinext，Cloudflare D1 持久化，Sites 私人站点登录与托管。模型调用遵循 Chat Completions JSON 输出接口，内置 DeepSeek、智谱 GLM、通义千问和 Kimi 配置选项。

```powershell
npm run install:ci
npm run build
node --test tests/summary.test.mjs tests/model-config.test.mjs
```

首次本地运行须按中文文档初始化数据库。没有模型 API Key 时，创建话题、保存原文和查看明确标注的示例仍可用，真实总结需配置密钥后生成。
