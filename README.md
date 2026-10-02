# 文枢 · 创作工作台

> 为创作留住脉络，让表达有据可循。

文枢是一个开源、以本地数据为主的创作者工作空间，面向独立媒体工作者、文化创作者和小型内容团队。它把项目、资料、稿件、事实核验、素材授权与发布前检查放在一条创作线上，帮助创作者管理过程，同时保留自己的判断。

![文枢首页：老街茶馆主题编辑插画](assets/tea-house-editorial.webp)

**当前版本：0.2.0 · 可独立使用的本地优先创作产品。** 纯静态模式无需账号与构建即可使用；可选 Node 服务提供 AI 辅助。项目数据保存在当前浏览器，云同步和多人协作尚未接入。

## 你可以用文枢做什么

- 为文章、短视频、播客或文化项目建立独立的创作空间。
- 用采访报道、短视频脚本、播客单集和文化活动模板开始项目。
- 收录网页、采访、文件和个人笔记等资料来源。
- 编辑稿件，并导出为 Markdown 文件。
- 把稿件中的事实陈述列入核验清单，关联来源并由你确认结果。
- 登记图片、音乐、字体、引文等素材的来源、使用位置和授权信息。
- 按创作进度查看下一步建议，并完成发布前检查。
- 搜索项目、汇总查看资料与素材，导出或导入本地备份。

文枢不会替你认定事实为真、判断素材可以商用或自动代替发布审核。AI 辅助默认关闭；启用后，只有你在每次操作中确认的文本会发给你配置的模型服务，结果不会自动加入稿件或被标记为已核验。

## 开始使用

### 直接打开

下载或克隆本仓库后，直接用现代浏览器打开 `index.html` 即可使用核心功能。示例项目与其中的来源均为虚构演示数据，不代表真实报道或证据；请勿将其作为事实依据。新建第一个个人项目后，示例项目会从工作区移出。

### 本地服务器

如需体验离线缓存或安装为桌面应用，请通过本地 HTTP 服务器打开。无需安装项目依赖：

```bash
# Windows（需安装 Python）
py -m http.server 8000

# macOS / Linux
python3 -m http.server 8000
```

然后访问 `http://localhost:8000`。也可以使用任意静态文件服务器托管根目录。

## 启用可选 AI 辅助

AI 辅助使用同源 Node 服务代理模型请求，**API 密钥只在服务端 .env 中读取**，不会进入浏览器或 GitHub 仓库。建议使用 Node.js 20 或更高版本：

<pre><code># Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env</code></pre>

在 .env 中填写模型服务地址、API 密钥和模型名称，然后启动：

<pre><code>npm start</code></pre>

访问 http://localhost:4173。无需 npm install，服务端只使用 Node 内置模块。示例默认使用 Responses API；OpenAI 兼容服务可设置 WENSHU_AI_API_STYLE=chat-completions。配置项见 .env.example。

每次请求前，创作者需要勾选确认。当前工具只发送任务指令和输入框中的文本，不会自动附带项目名、来源库、稿件其他段落或本地备份。模型结果需主动复制、应用或转为“待核验”条目。

- API 密钥按服务端密钥管理规范保管，绝不要放进前端代码或公开仓库；参见 [OpenAI API 密钥安全说明](https://platform.openai.com/docs/api-reference/authentication)。
- 如果使用 OpenAI API，API 用量单独计费，ChatGPT 订阅不包含 API 用量；请查看 [ChatGPT 与 API 计费说明](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus)。其他供应商按其自身价格和数据政策处理。
- GitHub Pages 只托管静态文件，不能运行 Node AI 服务。要使用 AI，请在本机或自己的 Node 主机运行应用与 API 服务。
- 默认只监听本机。远程监听必须配置 WENSHU_ACCESS_TOKEN 并放在 HTTPS 反向代理后。当前访问口令是单人自托管保护，不是多用户账号系统；不要把服务直接暴露给公网。

## 发布到 GitHub Pages

仓库已包含 GitHub Actions 部署工作流。将代码推送到 `main` 分支后，在 GitHub 仓库的 **Settings → Pages** 中选择 **GitHub Actions** 作为发布来源；此后每次推送到 `main` 会自动部署。也可在 **Actions** 页面手动运行部署工作流。

该站点是纯静态应用，无需服务器端密钥、数据库或构建服务。部署后可通过 GitHub Pages 提供的 HTTPS 地址访问；首次访问并加载应用后，Service Worker 会缓存应用外壳，以便之后离线打开。

## 数据与隐私

- 项目、稿件、资料和素材记录保存在浏览器 `localStorage` 中，不会自动上传。只有你确认的 AI 请求文本会由同源 Node 服务转发给你配置的模型供应商。
- 清除浏览器数据、使用无痕窗口或更换浏览器可能导致记录不可用。请在“设置与数据”中定期导出备份。
- 本地存储不是加密保险库；不要在共享设备上留下敏感采访资料或未公开稿件。
- 应用不包含分析、广告或遥测代码。界面字体使用设备本地字体，不请求第三方字体服务。
- 导入的备份会替换当前工作区数据。导入前请先导出当前数据。
- Service Worker 只缓存应用文件，不缓存用户输入的项目数据；用户数据仍由当前浏览器本地存储管理。

详情见[数据与隐私说明](docs/DATA-AND-PRIVACY.md)。

## 项目结构

```text
index.html                 应用入口与对话框
app.js                     页面、交互与本地数据逻辑
styles.css                 响应式界面与视觉样式
assets/                    品牌标志、应用图标与首页插画
manifest.webmanifest       可安装 Web 应用元信息
sw.js                      离线应用外壳缓存
server.mjs                 静态文件服务器与可选 AI 安全代理
.env.example               服务端环境变量示例
package.json               Node 启动脚本（无第三方依赖）
.github/workflows/         GitHub Pages 自动部署
.github/ISSUE_TEMPLATE/    缺陷与功能建议模板
docs/                      产品说明与隐私文档
```

应用不依赖前端框架或第三方 JavaScript 包。若要调整功能，通常从 `app.js`、`index.html` 和 `styles.css` 开始。

## 参与项目

欢迎反馈使用问题、建议工作流和提交改进。开始前请阅读[贡献指南](CONTRIBUTING.md)和[产品说明](docs/PRODUCT.md)。提交反馈时请勿附上未公开稿件、可识别的采访对象信息、个人资料、密钥或未授权素材。

- [提交缺陷](.github/ISSUE_TEMPLATE/bug_report.yml)
- [提出功能建议](.github/ISSUE_TEMPLATE/feature_request.yml)
- [查看变更记录](CHANGELOG.md)

## 许可

本项目以 [MIT License](LICENSE) 发布。自制标志与首页插画随本项目一同提供；插画为项目定制生成素材。代码和视觉资产的再使用均受仓库许可文件约束。
