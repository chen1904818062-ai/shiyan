# GitHub Pages 记忆地图

网页目录为 `memory-site/`。只发布该目录；不要发布仓库根目录、数据库备份、个人记忆导出文件、环境变量或密钥。

## 手动开通

1. 打开 [shiyan 的 Pages 设置](https://github.com/chen1904818062-ai/shiyan/settings/pages)。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。不需要修改仓库可见性。
3. 打开 [Memory atlas Pages 工作流](https://github.com/chen1904818062-ai/shiyan/actions/workflows/memory-pages.yml)，选择 **Run workflow → main**。
4. 等待工作流成功，点击 `deploy` 的 `github-pages` 环境链接。通常地址是 `https://chen1904818062-ai.github.io/shiyan/`，以工作流输出的实际地址为准。

当前源码仓库是私有仓库。如果 Pages 页面要求升级套餐，说明账号当前套餐不支持从私有仓库发布；请保持仓库私有。GitHub 官方说明：Free 支持公共仓库，私有仓库需要 Pro、Team 或 Enterprise。不要为了开通网页公开现有源码和个人数据。

## 使用

在拾言记忆档案中点击「导出记忆」，再在记忆地图选择 JSON。也可先点击「查看虚构示例」。点击图中的记忆节点或时间线条目，会显示内容、补充背景和原句。支持按关键词、状态筛选。私密及敏感记忆默认隐藏，每次导入都会重置显示权限。

网页不使用 API、不加载第三方脚本、不连接 Render/Turso、不写入 localStorage/sessionStorage。文件只在页面内存中解析，刷新或清除后移除；个人原始导出文件仍保留在用户设备上。部署网站会正常请求 GitHub Pages 静态资源，这不包含导入的记忆内容。

为了控制浏览器开销，支持最多10 MB、2,000条记忆及20,000条证据；当前筛选最多呈现200条。统计基于当前筛选的完整集合，超出显示范围时需缩小筛选。详情展示前30条证据。连线只代表已存储的话题和类型关系，不代表因果或推断出的社会关系。发生日期未提供时单列，不以导入日期补齐。

## 已验证与部署状态

已通过本地浏览器对项目子路径、键盘操作、私密筛选、时间线、恶意HTML输入、刷新清除及移动端的检查。Pages 设置因自动浏览器工具余额不足未执行，用户选择手动开通；未声称网站已在线。工作流使用固定提交SHA的官方Actions，并只上传 `memory-site/`。

参考：[GitHub Pages 创建要求](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)、[自定义发布工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
