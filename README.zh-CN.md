# 拾言 AI 记忆系统：当前独立部署

当前 v1.3.0 使用 Render + Turso，支持多人邮箱登录和各自隔离的数据空间。进入「我的记忆」管理长期记忆，使用「与记忆对话」和「规划与复盘」。完整说明见 [记忆系统使用指南](docs/MEMORY_SYSTEM.md)，当前部署说明见 [Render部署文档](deploy/README.md)。

以下保留早期对话归档与Sites开发说明；其中Cloudflare D1、Sites登录和单人站点描述对应原运行方式，不代表当前Render生产环境。

# 拾言 · 对话整理 Agent

第一版支持创建话题、复制粘贴来自不同 AI 的对话、留存完整原文、生成可追溯的详细总结，以及按周回顾。报告包含简短概览、具体内容、操作步骤、原文例子和适用条件；篇幅随材料量变化。界面适配手机与电脑。

记忆库在此基础上把对话沉淀为一条条可回跳的记忆，并支持确认、修订与推翻；对话是原料，记忆是可以长期积累的资产。

## 使用

1. 登录私人站点，创建话题，例如「大学生求职」，可填写整理范围。
2. 点击「添加对话」，填写标题、选择来源、粘贴10～50,000字的文本。原始对话日期可以留空。
3. 可多次添加对话，相同内容会去重。保留「用户：」「AI：」「ChatGPT：」等角色标记，有助于区分你的想法与 AI 的建议。
4. 在「模型设置」选择 DeepSeek、智谱 GLM、通义千问或 Kimi，填写该提供商的 API Key，点击「读取可用模型」（离开密钥输入框时也会读取）。列表来自平台接口；多个型号由用户选择，单个自动填入。不会默认改用旧型号。各提供商的配置独立暂存在当前页面内存中；刷新后需要重新填写。密钥不存入数据库或浏览器持久存储。
5. 点击总结要点下的来源标签查看对应原文；新增对话后可更新总结。可以导出 Markdown，文件包含总结和对应原文。
6. 「每周回顾」按北京时间的**导入日期**筛选，周一为一周起点，不把导入时间当作原始对话时间。第一版通过点击按钮生成周报。

没有 API Key 也可以创建话题、保存对话。首页的「先看看整理效果」使用明确标记的示例数据，不写入个人数据库。真实总结不会回退到示例或固定文本。

## 记忆库

对话整理是入口，记忆是沉淀。记忆库把对话拆成关于你本人的事实、能力、判断与目标，每条都能回到原句。

1. 在「模型设置」配置模型后，进入侧边栏「记忆库」，点击「提炼记忆」。
2. 选择一个话题，每次处理最多 3 段尚未提炼的对话，可重复执行直到全部完成。
3. 展开「N 条证据」查看引文，点击任意证据会打开完整原文并高亮对应句子。
4. 待确认的记忆可以「确认」「修订」或标记为「不准确」。修订与推翻都会保留修改前的版本，不会直接抹掉原判断。
5. 删除一段对话或整个话题时，由它提炼且没有其他证据支撑的记忆会一并删除。

抽取遵循三条规则：没有原文引文不成记忆；AI 说的话不会写成你的记忆，只能记为「参考观点」；说话人未标注时只作为待确认候选，置信度最低。同一句陈述在不同对话里重复出现时只保留一条，证据累积，置信度按证据数、独立来源数与时间跨度计算，不由模型自评。

记忆库是第一阶段的地基，线索聚合、洞察与职业/人生规划在后续阶段接入。完整设计见 `docs/拾言-记忆系统深化方案.md`。

## 数据与模型

- 话题、对话和每次生成的报告使用 Cloudflare D1 保存，并按登录用户 ID 隔离；站点默认仅本人可访问。桌面与手机登录同一个站点、同一账号可以查看相同数据。
- 记忆库新增 memories、memory_evidence、memory_revisions、threads 四张表，与原数据同库并按用户隔离。删除一段对话或整个话题时，由它提炼且没有其他证据的记忆会随原文一起清除。
- 来源标签 ChatGPT / 豆包 / DeepSeek 仅表示粘贴文本的来源，第一版没有连接或自动读取这些平台账号。
- 每段对话最多50,000字符，生成时序列化输入最多180,000字符，超出会明确拒绝，不静默截断。
- 模型请求会发送所选话题范围内的原文。报告校验格式与引用 ID；角色无法确认的原文不能作为「已明确的个人想法」的唯一依据。语义准确性仍需用户结合原文核对。
- 删除一段对话会清除该话题的已有报告，以避免残留对已删除原文的引用。确认弹窗会明确告知；之后可根据剩余内容重新整理。
- 同一话题最多展示最近100次报告，可通过「整理记录」切换。
- 模型列表由对应平台 `/models` 动态读取，API Key 通常可访问多个型号，不能据此推断用户唯一想用的型号。目录可能不完整，也不代表已验证调用权限、余额或 JSON 支持；平台不支持读取时会明确提示，可按平台控制台手动填写型号。报告分别保存请求型号和接口返回型号，不一致或未返回时提示；历史报告仅有请求型号，不能视为已核验。
- 用户填写的密钥只发送到所选提供商固定的官方接口，不接受浏览器传入任意服务地址。千问使用百炼北京地域密钥，Kimi 使用 Moonshot 中国站密钥。对话来源标签不会影响总结模型的选择。
- 服务端可用 `MODEL_API_KEY`、`MODEL_PROVIDER`、`MODEL_BASE_URL`、`MODEL_NAME` 配置默认服务。`MODEL_PROVIDER` 可选 `deepseek` / `glm` / `qwen` / `kimi`；留空接口地址和模型名称时使用所选提供商的默认值。已有仅配置 DeepSeek 或自定义兼容接口的环境变量继续有效。
- 显式选择某个提供商但未填写对应密钥时，会提示配置，不会自动借用另一提供商的服务端密钥。服务端已配置时，设置页可以明确选择「使用服务端配置」。

接口实现参考 [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[GLM-5.3-Flash 官方说明](https://docs.z.ai/guides/vlm/glm-5.3-flash)、[千问兼容接口](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)、[千问结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output) 和 [Kimi Chat Completions](https://platform.kimi.com/docs/api/chat)。GLM-5.3-Flash 系列保留必须开启的思考模式；不同模型的响应时间、额度和参数支持不同，不会自动换用别的型号。

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

已有本地数据库时，只需补充执行 `drizzle/0001_rich_jasper_sitwell.sql` 新增记忆相关表，不需要重建原有数据。

服务端模型配置为选填。若需要本地默认配置，可将 `.env.example` 复制为 `.dev.vars` 并填写，供 Cloudflare 本地运行时加载；不要提交真实密钥。线上通过 Sites 的环境变量管理配置，不写入 `.openai/hosting.json`。

## 验证

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --test tests/summary.test.mjs tests/model-config.test.mjs tests/memory.test.mjs
npm run build
```

本地浏览器集成测试覆盖登录访问限制、身份头伪造拦截、话题创建、原文保存、去重、缺少密钥、输入校验、刷新后的持久化、移动端布局、原文引用、导出、周报筛选和删除。启动 dev 后，安装 Playwright（或通过 `PLAYWRIGHT_PATH` 指定现有模块路径），配置 `TEST_BROWSER_PATH` 指向本机 Chrome/Edge，再执行：

```powershell
node tests/browser.test.mjs
node tests/model-settings.browser.mjs
```

模型测试覆盖官方接口选择、提供商专用参数、服务端兼容性、密钥隔离、自定义模型和页面配置恢复。浏览器测试中的模型请求使用模拟响应拦截，不发起付费调用。测试数据只写入本地预览数据库，结束时删除测试话题，截图保存在忽略跟踪的 `.sites-runtime/screenshots/`。真实模型生成需要有效 API Key；没有密钥时，不能完成真实模型质量与连通性验收。
