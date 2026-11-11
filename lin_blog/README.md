# LinBlog Frontend

LinBlog 的前端工作区，包含访客门户与创作后台两套界面。

## 技术栈

- Vue 3 + TypeScript + Vite
- Pinia + Vue Router
- Yike Design + Less
- ECharts
- WangEditor（裁剪版）
- Playwright + Node Test Runner

## 目录

```text
src/
├── api/          # 后端接口封装
├── components/   # 通用组件、编辑器、门户组件
├── router/       # 路由与权限守卫
├── store/        # Pinia 会话与分类状态
├── style/        # 后台、门户、主题变量
├── utils/        # 主题、SEO、图片、工作流等纯函数
└── views/        # 门户页与后台页面

e2e/              # Playwright 端到端回归
test/             # 前端纯函数单测
public/           # 门户横幅、图标与静态资源
```

## 开发

```bash
npm ci
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`，并把 `/api`、`/sitemap.xml`、
`/robots.txt`、`/feed.xml` 代理到 `http://localhost:3030`。
后端端口不同时，可以设置：

```bash
LINBLOG_DEV_API_PORT=3031 npm run dev
```

## 构建

```bash
npm run build
```

`build` 会先执行 `vue-tsc -b`，再交给 Vite 打包。生产产物位于 `dist/`，
由根目录 Express 服务统一托管。

## 测试

```bash
npm test                  # 纯函数与路由守卫单测
npm run test:e2e:install  # 首次安装 Chromium
npm run test:e2e          # Playwright 端到端回归
npm run test:e2e:ui       # Playwright 可视化调试
```

E2E 使用 `e2e/fixtures/mockApi.ts` 拦截 `/api/**`，不需要本地 MySQL 或后端进程。
公司网络下载 Chromium 较慢时，可以复用系统 Chrome：

```bash
$env:PLAYWRIGHT_CHANNEL="chrome"
npm run test:e2e
```

## 页面入口

| 路径 | 说明 |
| --- | --- |
| `/portal` | 门户首页 |
| `/portal/articles` | 文章归档 |
| `/portal/gallery` | 摄影图库 |
| `/portal/diary` | 随笔 |
| `/loginRegister` | 登录与注册 |
| `/overView` | 后台总览 |
| `/article` / `/editarticle` | 文章列表与编辑 |
| `/gallery` / `/editgallery` | 图库列表与编辑 |
| `/diary` | 随笔管理 |
| `/aiManage` | AI 管理与模型接入 |
| `/aiPrompt` | 提示词模板与试跑验证 |
| `/permissionManagement` | 角色权限矩阵 |
| `/systemLog` | 系统日志 |
| `/setting` | 系统设置与备份 |

更完整的项目说明、AI 能力和部署方式见根目录 [README.md](../README.md)。

