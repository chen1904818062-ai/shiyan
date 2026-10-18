# 拾言 · 对话整理 Agent

第一版支持创建话题、复制粘贴来自不同 AI 的对话、留存完整原文、生成可追溯的精简总结，以及按周回顾。界面适配手机与电脑。

## 使用

1. 登录私人站点，创建话题，例如「大学生求职」，可填写整理范围。
2. 点击「添加对话」，填写标题、选择来源、粘贴10～50,000字的文本。原始对话日期可以留空。
3. 可多次添加对话，相同内容会去重。保留「用户：」「AI：」「ChatGPT：」等角色标记，有助于区分你的想法与 AI 的建议。
4. 在「模型设置」选择 DeepSeek、智谱 GLM、通义千问或 Kimi，填写该提供商的 API Key，再选择预设模型或自定义模型名称。各提供商的配置独立暂存在当前页面内存中，切换时不会把某一家的密钥带到另一家；刷新后需要重新填写。密钥不存入数据库或浏览器持久存储。
5. 点击总结要点下的来源标签查看对应原文；新增对话后可更新总结。可以导出 Markdown，文件包含总结和对应原文。
6. 「每周回顾」按北京时间的**导入日期**筛选，周一为一周起点，不把导入时间当作原始对话时间。第一版通过点击按钮生成周报。

没有 API Key 也可以创建话题、保存对话。首页的「先看看整理效果」使用明确标记的示例数据，不写入个人数据库。真实总结不会回退到示例或固定文本。

## 数据与模型

- 话题、对话和每次生成的报告使用 Cloudflare D1 保存，并按登录用户 ID 隔离；站点默认仅本人可访问。桌面与手机登录同一个站点、同一账号可以查看相同数据。
- 来源标签 ChatGPT / 豆包 / DeepSeek 仅表示粘贴文本的来源，第一版没有连接或自动读取这些平台账号。
- 每段对话最多50,000字符，生成时序列化输入最多180,000字符，超出会明确拒绝，不静默截断。
- 模型请求会发送所选话题范围内的原文。报告校验格式与引用 ID；角色无法确认的原文不能作为「已明确的个人想法」的唯一依据。语义准确性仍需用户结合原文核对。
- 删除一段对话会清除该话题的已有报告，以避免残留对已删除原文的引用。确认弹窗会明确告知；之后可根据剩余内容重新整理。
- 同一话题最多展示最近100次报告，可通过「整理记录」切换。
- 模型预设包括 DeepSeek（`deepseek-flash`、`deepseek-v4-pro`）、智谱 GLM（`glm-4.7`、`glm-4.7-flashx`）、通义千问（`qwen-plus`、`qwen-flash`）、Kimi（`kimi-k2.6`）。也可填写同一提供商的其他模型 ID，需要支持 Chat Completions 与 JSON 输出，实际可用性取决于账户权限。
- 用户填写的密钥只发送到所选提供商固定的官方接口，不接受浏览器传入任意服务地址。千问使用百炼北京地域密钥，Kimi 使用 Moonshot 中国站密钥。对话来源标签不会影响总结模型的选择。
- 服务端可用 `MODEL_API_KEY`、`MODEL_PROVIDER`、`MODEL_BASE_URL`、`MODEL_NAME` 配置默认服务。`MODEL_PROVIDER` 可选 `deepseek` / `glm` / `qwen` / `kimi`；留空接口地址和模型名称时使用所选提供商的默认值。已有仅配置 DeepSeek 或自定义兼容接口的环境变量继续有效。
- 显式选择某个提供商但未填写对应密钥时，会提示配置，不会自动借用另一提供商的服务端密钥。服务端已配置时，设置页可以明确选择「使用服务端配置」。

接口实现参考 [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[智谱 GLM-4.7](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)、[千问兼容接口](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)、[千问结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output) 和 [Kimi Chat Completions](https://platform.kimi.com/docs/api/chat)。预设模型默认使用非思考参数；自定义的思考模型可能需要更多生成时间及输出预算，失败时可切回预设模型。

## 本地开发

要求 Node.js >=22.13、npm、Git（发布时需要）。

```powershell
npm run install:ci
npm run db:generate  # 修改 schema 后使用；已有迁移无需重复生成
npm run build
```

首次本地预览需要初始化数据库：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_gorgeous_la_nuit.sql
npm run dev
```

打开 `http://127.0.0.1:5173/`。本地使用 Sites 提供的模拟登录账号；线上使用真实登录机制。开发环境的模拟身份机制不会包含在生产构建中。

服务端模型配置为选填。若需要本地默认配置，可将 `.env.example` 复制为 `.dev.vars` 并填写，供 Cloudflare 本地运行时加载；不要提交真实密钥。线上通过 Sites 的环境变量管理配置，不写入 `.openai/hosting.json`。

## 验证

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --test tests/summary.test.mjs tests/model-config.test.mjs
npm run build
```

本地浏览器集成测试覆盖登录访问限制、身份头伪造拦截、话题创建、原文保存、去重、缺少密钥、输入校验、刷新后的持久化、移动端布局、原文引用、导出、周报筛选和删除。启动 dev 后，安装 Playwright（或通过 `PLAYWRIGHT_PATH` 指定现有模块路径），配置 `TEST_BROWSER_PATH` 指向本机 Chrome/Edge，再执行：

```powershell
node tests/browser.test.mjs
node tests/model-settings.browser.mjs
```

模型测试覆盖官方接口选择、提供商专用参数、服务端兼容性、密钥隔离、自定义模型和页面配置恢复。浏览器测试中的模型请求使用模拟响应拦截，不发起付费调用。测试数据只写入本地预览数据库，结束时删除测试话题，截图保存在忽略跟踪的 `.sites-runtime/screenshots/`。真实模型生成需要有效 API Key；没有密钥时，不能完成真实模型质量与连通性验收。
