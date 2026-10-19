# Render + Turso 部署

已部署目标：Render 的 `帅's workspace`，新加坡区域，独立的 `shiyan-beta` Web Service，源码仓库 `chen1904818062-ai/shiyan`。数据库使用为拾言新建的独立 Turso **libSQL** 数据库。新版本复用现有页面和业务接口，不依赖 Sites 登录或 Cloudflare D1。

## 多人账号版本 v1.1.0

新增 Resend 邮箱验证码、腾讯云 +86 手机验证码、独立账号、手机与邮箱绑定及账号数据隔离。发送凭证尚未填写，公开入口保持关闭，原密码空间继续可用。配置及原空间绑定步骤见 [账号接入说明](ACCOUNT_SETUP.md)。自动验收使用模拟发送，真实收码需配置后再验证。

## 个人正式版发布

2026-10-19 按现有 Render + Turso 服务发布 v1.0.0。沿用当前访问地址和私人空间，以 /healthz 中的 version 与 Render 特定部署状态确认实际运行版本。发布范围见 [版本说明](../CHANGELOG.md)。当前实例规格沿用 Free，未变更付费配置。

正式版部署 `dep-dbaq4e3m8hqs73bm2bug` 已确认 live，线上健康接口返回 version=1.0.0。随后完成 GLM 真实验收：平台目录返回11个型号，选择 glm-5.3-flash 后，接口返回同一型号；详细报告及调用记录已保存，可在「正式版验收（虚构资料）」查看。

## 初次部署记录

本地独立运行构建和功能验收已完成，源码已推送至 [shiyan 私有仓库](https://github.com/chen1904818062-ai/shiyan)。已在 Turso 创建独立的 `shiyan-beta` libSQL 数据库，地区为 Tokyo（AWS `ap-northeast-1`）。数据库认证信息仅用于服务环境变量，不写入源码。

2026-10-18 已完成海外测试部署：[打开拾言测试版](https://shiyan-beta.onrender.com)。[Render 服务控制台](https://dashboard.render.com/web/srv-dbadkqvbtjjs73eoft30)，服务 ID 为 `srv-dbadkqvbtjjs73eoft30`，首次部署 `dep-dbadkr7btjjs73eofupg` 已确认 `live`。

线上已验证 `/healthz`、匿名访问拦截、密码登录与安全 Cookie、话题创建、原文完整保存、重复导入拦截、Turso 中的实际存储、退出登录以及无模型密钥时的提示。验收数据已删除。真实模型调用需配置 API Key 后再验收。

登录密码在上述 Render 服务的 Environment 中查看 `APP_ACCESS_PASSWORD`，可以修改并重新部署。数据库令牌只保存在服务环境变量中；创建过程中更换过令牌，旧令牌已通过实际连接验证失效。Codex 的 GitHub 连接权限与 Render 的仓库权限分别管理，后续新增私有仓库时应分别授权。

## 首次部署

1. 确认 GitHub 连接有权访问 `shiyan` 私有仓库，并将本项目源码推送至该仓库。
2. 在 [Turso 控制台](https://app.turso.tech/) 为拾言创建单独的 **libSQL** 测试数据库。选择与新加坡部署较接近的可用地区；不要复用或清空其他项目的数据库。当前适配器使用官方 `@libsql/client/web`，不使用 Turso 新引擎专属 SDK。
3. 取得数据库的 `libsql://...` URL 和具备读写权限的数据库令牌。令牌仅填入 Render 的环境变量设置，不提交到仓库，不放入聊天。
4. 在已确认的 Render 工作区，从本仓库创建 Docker Web Service，使用根目录 `Dockerfile`。代码内也提供了 `render.yaml`，可以通过 Blueprint 创建。
5. 采用测试用 Free 实例，区域 Singapore；监听 `0.0.0.0:$PORT`，健康检查路径 `/healthz`。数据库保存在 Turso，不依赖 Render 的本地文件系统。
6. 配置下表环境变量。启动时按历史记录执行数据库迁移，失败时不会开放私人空间。等 Render 的特定部署状态变为 `live`，并验证健康检查、登录和原文保存后，再把该 URL 作为可用测试版交付。

| 环境变量 | 设置方法 |
| --- | --- |
| `TURSO_DATABASE_URL` | 新测试库的 `libsql://...` URL，必填 |
| `TURSO_AUTH_TOKEN` | 该库的读写令牌，必填，保密 |
| `APP_ACCESS_PASSWORD` | 至少16字符的测试访问密码，必填；Blueprint 会自动生成，可在 Render 环境变量中查看或修改 |
| `APP_OWNER_ID` | 固定为 `shiyan-private-owner`，迁移时保留 |
| `APP_DISPLAY_NAME` | 可选，私人空间中显示的名称 |
| `APP_BASE_URL` | Render 通常无需填写，会读取自动提供的 `RENDER_EXTERNAL_URL`；其他平台须填公开 HTTPS 地址 |
| `MODEL_API_KEY` 等 | 可选，仍可直接在网页模型设置中临时填写个人密钥 |

Free 实例的休眠、配额和文件系统规则参考 [Render 官方说明](https://render.com/docs/free)。同一个工作区的免费实例共享月度运行额度；本配置没有升级为付费实例，也不修改已有 `tongpinlab` 服务。

公开登录关闭时仍以原访问密码保护个人空间；多人功能需按上述接入说明配置并启用，才开放给其他用户。

原 Sites 版本和新 Turso 测试库相互独立。旧 D1 数据保留在原站点，不会自动搬到新库，也不会因这次部署而删除。

## 本地验收

```powershell
npm ci
npm run build:standalone
node --test tests/standalone.test.mjs tests/summary.test.mjs tests/model-config.test.mjs
```

`tests/standalone.test.mjs` 仅使用临时本地 SQLite 文件，显式开启 `ALLOW_LOCAL_DB`；验证迁移重复执行、事务回滚、登录、伪造身份头拦截、原文持久化、进程重启和退出登录。它不能代替真实 Turso 连接验收。

源码默认仍可构建原 Sites 版本，`npm run build` 和 `npm run build:standalone` 分别产生 `dist/` 和 `standalone-dist/`。模型功能共用同一份业务实现。

## ICP 备案完成后的腾讯云迁移

这部分是迁移配置和操作说明，不会提前创建腾讯云资源或自动切换域名。

1. 在目标腾讯云服务器安装 Docker 与 Compose，部署同一份代码或镜像。
2. 将 `deploy/standalone.env.example` 复制为服务器上的 `.env.standalone`，配置访问密码、数据库连接和正式 `APP_BASE_URL=https://你的域名`。该文件不进入版本控制。
3. 首次迁移可继续连接同一个 Turso 库，并保持 `APP_OWNER_ID`，先验证应用迁移，再单独处理数据库迁移。
4. 执行 `docker compose up -d --build`。服务只绑定本机 `127.0.0.1:17878`，由已有反向代理和 HTTPS 入口转发；不会默认占用其他项目的80或443端口。
5. 如需将数据库也迁入腾讯云，先暂停写入并备份。`scripts/transfer-data.mjs` v2 导出账号、已验证登录地址、话题、原文和报告，不导出会话、验证码和服务密钥。导入只接受空目标库；还原后重新配置发送服务和 APP_AUTH_SECRET。

```powershell
# 在可信环境通过环境变量配置源 Turso 连接后导出
node scripts/transfer-data.mjs export /absolute/path/shiyan-backup.json

# 修改为目标数据库连接后导入；先确认目标为空
node scripts/transfer-data.mjs import /absolute/path/shiyan-backup.json
```

小规模单实例也可用持久卷中的 SQLite：设置 `ALLOW_LOCAL_DB=true`、`TURSO_DATABASE_URL=file:///data/shiyan.sqlite`，保留 Compose 的 `/data` 数据卷。多实例须使用适合的共享数据库方案。迁移时保留账号 ID 及归属映射，原空间还需保留 `APP_OWNER_ID`。

6. 验证健康检查、登录、话题数量、原文、总结引用和模型调用，确认后再切换正式域名。Render 回滚不等于数据库回滚，旧测试环境应在新环境验收后再处理。
