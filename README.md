# LinBlog
LinBlog 是一套「前台门户 + 后台管理」一体化的个人博客系统，采用 Vue 3 + TypeScript 前端和 Express + MySQL 后端。访客可在无需登录的门户页浏览、检索、阅读已发布文章并查看公开评论；管理员在后台完成文章、摄影图库、本地文件、日记、评论/私信、用户、分类/标签与总览统计的全流程管理。前端内置 11 套可切换主题（含浅色/深色基调与四套渐变配色），前台与后台共用主题能力；后台已统一侧栏、顶栏、统计卡片、列表分页和编辑页面的视觉与响应式规则。后台各模块均已完成真实接口联调，访问数据由后端中间件写入 `record` 表积累，并按 90 天保留期滚动清理。

## 功能亮点

* **访客门户（四页结构）**：`/portal` 首页（Hero + 分类索引 + 最新文章 + 摄影照片墙 + 随笔卡片 + 标签云）、`/portal/articles` 文章归档（分类/标签筛选 + 关键词搜索 + 分页，筛选条件同步到地址栏）、`/portal/gallery` 摄影图库（CSS columns 瀑布流 + 分页 + 当前页详情弹窗）、`/portal/diary` 随笔（天气筛选 + 错落卡片墙 + 当前页详情弹窗）。文章详情支持登录用户点赞/取消点赞与发表评论，点赞数和评论数实时回写列表；匿名访客可正常阅读，互动时引导登录。四页共用 `PortalLayout` 顶栏/页脚，正文详情一律当前页弹窗，不跳转页面。配色全部取自主题变量，11 套预设与深浅色自动联动；无封面内容用主题色排印占位，移动端自适应。
* **11 套主题**：默认浅色/深色，叠加海洋蓝、森林绿、樱花粉、极光绿、落日橙、星云紫、黑曜石、午夜蓝、摩卡棕；`data-theme` 驱动组件明暗，`data-theme-preset` 注入品牌色与背景，选择持久化并在启动时恢复。
* **后台全模块真实联调**：文章支持列表、新建、编辑、搜索、发布、撤回、删除及详情弹窗；日记支持天气图标与最多 6 张图片；图库分组与文章分组共用同一套分类数据。总览页统计卡片、访问量折线图与设备/系统分布饼图均走真实接口。
* **统一后台视觉与响应式体验**：侧栏按运营/内容/系统分组，图标、悬停态、焦点态和选中态统一；顶部保留主题下拉、私信未读提示与用户入口。总览和用户管理复用 `StatCard`，支持配色、图标、点击筛选与当前筛选高亮；文件、图库和私信列表会按视口宽高动态计算每页数量，大屏下保持多行填充，不出现单行或大面积留白。图库编辑页左右卡片等高，评论分页固定在内容分隔线下方，图库初始化不会重复请求。

## 项目结构与当前状态

| 目录/模块 | 当前实现 |
| --- | --- |
| `lin_blog/` | Vue 3、TypeScript、Vite、Pinia、Vue Router、Yike Design；包含总览、用户管理、文章、图库、文件、日记及编辑页面。文章封面使用 `yk-upload`，详情 HTML 使用 DOMPurify 清洗。 |
| `serve/` | Express 5 API、JWT 认证、MySQL 数据模型；路由覆盖用户、文章、评论、消息、日记、文件、图片上传、上传票据、分类、标签和总览统计。 |
| `Documentation/` | 开发进度及数据库设计文档。 |
| 门户（访客前台） | 拆成四个独立页面：`/portal` 首页、`/portal/articles` 文章归档、`/portal/gallery` 摄影图库、`/portal/diary` 随笔，均匿名可访问。共用 `PortalLayout`（顶栏、页脚、`#app` 顶栏补偿）与 `PortalPhotoWall`（12 栏错落照片墙）；详情统一为当前页弹窗（`PortalArticleDetail` / `PortalGalleryDetail` / `PortalDiaryDetail`）。见 `lin_blog/src/views/Portal*.vue`、`lin_blog/src/components/portal/`、`lin_blog/src/style/portal.less`。 |
| 门户浏览量与热度 | 文章、摄影图库、随笔均支持真实浏览量统计：打开详情弹窗即计一次浏览，`view_log` 表按「登录用户 / 游客 IP」做 30 分钟去重后自增 `article.views` / `diary.views`，计数回写列表卡片；三个归档页均提供「最新 / 最热」排序切换，`sort=hot` 走 SQL 排序而非前端重排。见 `serve/controller/viewController.js`、`serve/model/dbModel/view/index.js`、`lin_blog/src/api/portal.ts`。 |
| 随笔天气筛选 | `/api/public/diary` 支持 `weather` 参数在 SQL 层过滤，翻页后筛选不失效；天气标签数量由后端全量统计后回传（`weatherFacet` / `facetTotal`），不再只统计当前页。筛选可与 `sort=hot` 叠加并同步到地址栏。见 `serve/model/dbModel/diary/index.js`、`lin_blog/src/views/PortalDiary.vue`。 |
| 主题系统 | 11 套可切换主题，双层变量（`data-theme` + `data-theme-preset`）驱动，选择持久化并在启动恢复，与顶栏明暗开关联动。见 `lin_blog/src/utils/themes.ts`、`lin_blog/src/utils/themePreset.ts`、`lin_blog/src/style/theme-presets.less`。 |
| 后台视觉与响应式 | `admin.less` 统一后台外壳、卡片、滚动区和大屏布局；`MenuBar` 分组导航，`StatCard` 可复用统计卡，`responsivePageSize` 处理文件、图库和消息列表分页。图库编辑左右等高，评论分页位于内容底线下方。见 `lin_blog/src/style/admin.less`、`lin_blog/src/components/common/StatCard.vue`、`lin_blog/src/utils/responsivePageSize.ts`。 |
| 用户管理 | 管理员用户列表/搜索/分页、创建、编辑、删除和启用/禁用已联调；统计卡（用户总数/管理员/编辑与普通用户/封禁用户）支持点击筛选与选中高亮，除总数外只统计启用用户。 |
| 文章 | 已完成列表、筛选、搜索、新建、编辑、发布、撤回、删除及当前页详情弹窗联调；新建入口位于总览/Gather 页面。图片上传到本地目录，文章 `cover` 字段保存访问 URL。 |
| 评论、消息 | 已接入真实 API：评论列表/回复/删除、举报数展示、私信收发、一键已读、未读红点提示均可用。 |
| 文件 | 本地文件已接入数据库：上传（多选、单文件 20MB 上限）、图片/文件/视频/压缩包分组、批量移动与删除、下载与缩略图。 |
| 图库 | 摄影图库已接入数据库：图片集创建/编辑/发布/撤回、瀑布流展示、分组与文章分组共用（分组仅在文章页维护）。 |
| 日记 | 随笔随记已接入数据库：天气图标字典与前端对齐（8 种）、图片上限 6 张、按天记录；公开列表支持按天气名在 SQL 层过滤。 |
| 总览 | 四张统计卡片（文件总大小、文章、图库、日记数量）走聚合接口 `GET /api/overview/summary`；访问量折线图与设备/系统分布饼图走 `GET /api/overview/visitStats`，近一周/近一月切换相互独立。 |

### 本地开发命令

前端在 `lin_blog/` 目录安装项目依赖后，可使用：

```sh
npm run dev
npm run build
```

`build` 会先执行 `vue-tsc -b` 类型检查，再运行 Vite 构建。2026-10-27 本地验证构建通过；已安装 `vite-plugin-html`、`vite-plugin-vue-devtools` 与 `@types/node`，补齐 Vite 配置所需依赖和 Node 类型。MockJS 已移除，`eval` 警告消失。经图标按需注册与 echarts 特性裁剪后，仅剩 `editor`（约 812 KB，只在编辑页按需加载）一个超阈值 chunk，`yike-design` 与 `echarts` 已压到阈值内，`chunkSizeWarningLimit` 为 600，详见 [Documentation/开发进度.md](Documentation/开发进度.md)。

后端在 `serve/` 目录执行：

```sh
npm test
npm run db:migrate
npm run db:seed
npm start
```

`serve/.env.example` 提供 JWT、数据库连接、CORS 和 JSON 请求体限制的配置模板；`serve/linlog.js` 会通过 Node.js 的 `loadEnvFile` 加载 `.env`。`LINBLOG_JWT_SECRET` 至少需要 32 个字符。前端 Vite 开发服务器将 `/api` 代理到 `http://localhost:3030`。

#### CORS 跨域配置

`LINBLOG_ALLOWED_ORIGINS` 必须列出实际访问前端的完整来源（协议、域名和可选端口），多个来源用英文逗号分隔，例如 `http://localhost:5173,https://blog.example.com`。不要配置路径、尾部斜杠或通配符；来源格式无效或变量缺失时，服务会在启动配置阶段给出明确错误并退出。后端允许 `Authorization` 请求头以及 `GET/POST/PUT/PATCH/DELETE` 等实际使用的方法，`OPTIONS` 预检由 CORS 中间件在路由前处理。生产部署应只填写可信前端来源，并通过部署平台的环境变量管理密钥。

**数据库安全提示：** 后端启动会幂等创建数据库和表，并执行 `schema_migrations` 中尚未应用的增量迁移，但不会自动插入演示数据。需要演示数据时显式执行 `npm run db:seed`；该脚本在 `users` 表已有数据时跳过。对有价值的数据仍应先备份并在隔离环境验证迁移。

### 已注册的后端 API

| 模块 | 路由 | 认证/说明 |
| --- | --- | --- |
| 用户管理 | `PUT /api/user/updateUser/:id`、`DELETE /api/user/deleteUser/:id`、`PUT /api/user/updateUserStatus/:id` | 管理员操作，需要认证。 |
| 用户 | `GET /api/user/isRegistered`、`POST /api/user/register`、`POST /api/user/login` | 注册和登录公开。 |
| 用户 | `POST /api/user/userInfo`、`POST /api/user/allUser`、`POST /api/user/createUser` | 需要 Bearer Token；用户列表和管理员创建用户仅管理员可操作。 |
| 文章 | `POST/GET /api/article`、`GET/PUT/DELETE /api/article/:id`、`PATCH /api/article/:id/status` | 需要 Bearer Token；列表支持分页、状态、类型和分类筛选。 |
| 公开只读（门户） | `GET /api/public/article`（支持 `classify=article|image`）、`GET /api/public/article/:id`、`GET /api/public/comment?articleId=...`、`GET /api/public/subset`、`GET /api/public/label`、`GET /api/public/diary`（支持 `weather` 按天气名过滤、`sort=hot` 按浏览量排序，并回传 weatherFacet 分面计数） | 无需登录；无论是否携带 Token，都只能读取已发布文章、对应正常评论、分类/标签列表与状态正常的随笔，门户不会因登录而切回后台作者视角。 |
| 门户互动（需登录） | `POST /api/public/comment`、`GET /api/public/praise/:id`、`POST /api/public/praise/:id` | 评论与点赞需登录，匿名返回 401；点赞状态可匿名读取。只能互动已发布内容，回复仅支持两级。 |
| 门户浏览计数 | `POST /api/public/view` | 匿名可调用；按「登录用户 / 游客 IP」去重（30 分钟窗口），只统计已发布文章、图库与正常状态随笔，返回回读后的浏览量。 |
| 图片上传 | `POST /api/upload/ticket`、`POST /api/upload/image?ticket=...`、`GET /api/uploads/:filename` | 上传需要认证，支持 JPG、PNG、WebP、GIF，单文件不超过 8 MB；返回的 URL 可通过静态路由公开访问。 |
| 评论 | `GET/POST /api/comment`、`DELETE /api/comment/:id`、`GET /api/comment/my` | 需要 Bearer Token。 |
| 消息 | `POST /api/message`、`GET /api/message/inbox`、`GET /api/message/outbox`、`PATCH /api/message/read`、`DELETE /api/message/:id`、`GET /api/message/unread/count` | 需要 Bearer Token。 |
| 日记 | `GET/POST /api/diary`、`GET/PUT/DELETE /api/diary/:id` | 需要 Bearer Token；天气按名称匹配前端字典，图片最多 6 张。 |
| 文件 | `GET /api/file`、`GET /api/file/summary`、`POST /api/file/upload?ticket=...`、`PATCH /api/file/move`、`DELETE /api/file`、`GET /api/file/:id/download` | 上传需要认证（一次性票据）；下载公开，缩略图加 `?inline=true`。 |
| 分类 | `GET /api/subset?classify=...`、`POST /api/subset`、`PUT /api/subset/:id`、`DELETE /api/subset/:id` | 需要认证；图库（`classify=image`）复用文章分组，仅计数口径不同。 |
| 标签 | `GET/POST /api/label`、`DELETE /api/label/:id` | 需要认证；标签被文章引用时禁止删除。 |
| 总览统计 | `GET /api/overview/summary`、`GET /api/overview/visitStats?period=week\|moon` | 需要 Bearer Token；summary 聚合文件总大小、文章/图库/日记数量、评论数与私信未读数，visitStats 返回每日访问量与设备/系统分布。 |
| 系统日志 | `GET /api/systemLog` | 仅管理员；记录登录与各模块写操作（创建/更新/删除、目标类型与 IP），支持分页与关键词搜索。 |

用户管理的前端请求封装位于 `lin_blog/src/api/user.ts`。登录、注册页面使用 `/api/user/login` 和 `/api/user/register`；认证请求从 `localStorage` 读取令牌并添加认证头。文章 API 封装在 `lin_blog/src/api/article.ts`，文章列表、编辑器和详情弹窗已调用真实接口。

图片以二进制保存于数据库 `image` 表（MEDIUMBLOB，单张上限 8 MB），`GET /api/uploads/:filename` 直接从数据库读取并返回；历史磁盘图片已通过迁移 `20261024_image_storage` 一次性导入。文章封面被替换或文章被删除时，后端会检查旧封面图片的引用（文章封面/正文、日记图片、用户头像），无引用则软删对应 `image` 行，`/api/uploads` 访问随之失效。

**上传凭证使用短期票据**：`yk-upload` 自带 XHR 且无法附加自定义请求头，凭证只能拼在 URL 上。为避免长期 JWT 进入访问日志与浏览器历史，前端先调 `POST /api/upload/ticket`（需登录）换取票据，再把票据拼到上传地址上。票据绑定用户 ID 与来源 IP，5 分钟过期、按次消费（默认 50 次，覆盖一次性批量选择），服务端只存 SHA-256 哈希；票据校验通过后仍查库确认账号存在且未被禁用。上传失败同样以 HTTP 200 返回，并通过 `error` 字段传递原因——`yk-upload` 不处理非 200 响应。

### 当前限制与待办

* 用户管理 CRUD 和账号启停用已联调；统计卡除“用户总数”外只统计启用用户，“编辑与普通用户”不含游客（后端 `staff` 过滤口径一致）。公开注册已同时检查邮箱与用户名重复（重复返回 400），并发唯一键冲突仍落入通用 500 待补测。
* 前端构建目前通过，MockJS `eval` 警告已消失；首屏体积已治理（图标由整包注册改为按需注册 48 个库内图标，echarts 裁剪未用特性），首屏 gzip 约 188→144 KB。仅剩 `editor`（约 812 KB）超阈值，它只在编辑页按需加载，可评估换更轻的编辑器。
* 文章、图库、文件、日记、评论/消息、分类/标签和总览统计（含访问量/数据监测图表）已完成真实 API 联调。访问数据由中间件从功能上线起写入 `record` 表并按 90 天保留期滚动清理（可用 `LINBLOG_RECORD_RETENTION_DAYS` 覆盖），历史数据从功能上线起积累；`position` 字段可配置 `LINBLOG_GEOIP_URL` 接 IP 地理解析（默认关闭），饼图来源维度目前使用操作系统分布。
* 文章模型依赖 `article.user_id` 保存作者及执行权限过滤；迁移版本 `20261023_article_owner` 已在本地测试库执行验证。历史文章作者列允许为 `NULL`。
* JWT 密钥由 `LINBLOG_JWT_SECRET` 提供并要求至少 32 字符，`.env` 会由后端入口加载。认证中间件已区分 Token 错误（401）与数据库故障（503）。
* CORS 允许来源可通过 `LINBLOG_ALLOWED_ORIGINS` 配置，并已允许 `Authorization` 请求头和 `PATCH` 方法。Vite 同源代理开发路径不代表所有跨域部署均已完成验证。
* 文章/评论图片保存于 `image` 表并有引用清理；文件模块的磁盘文件在逻辑删除后保留以便恢复，暂无定期清理、备份或云存储同步机制。
* 后端 `npm test` 当前 `163/163` 通过，覆盖配置校验、文章、评论（安全与两级边界）、门户点赞与公开评论、门户浏览计数（去重、目标不存在、参数校验）、浏览量模型（去重窗口、过期清理、跨表计数）、随笔天气 SQL 过滤与全量分面、用户权限、消息角色、认证中间件（含禁用账号、数据库故障，以及上传票据的签发/按次消费/过期/来源绑定/重放、伪造票据与无票据拒绝）、公开只读权限边界（含门户分类/标签/随笔路由与登录态不串用作者过滤）、封面引用清理、迁移幂等、请求体归一化、图片存储、文件/分类/标签/日记控制器、天气字典、访问统计、访问记录保留期清理与地理解析降级、系统日志等；测试使用模块替身。真实 MySQL 集成测试见 `serve/test/integration.realDb.test.js`，需设置 `LINBLOG_INTEGRATION_DB` 指向独立验证库才会运行（自动建库迁移、跑完删除，禁止指向默认业务库）。

### 当前验证状态

* 2026-10-25：前端 `vue-tsc` 类型检查和 Vite 生产构建通过，后端测试 `104/104` 通过；另在隔离 MySQL 验证库完成 8 项真实集成测试（迁移幂等、角色过滤、文章权限、图片二进制读写、封面引用清理、评论边界、账号启停用），验证库用后即删。
* 门户 `/portal` 已用无头 Chrome 端到端实测：匿名访问正常渲染文章/分类/标签，分类与标签筛选、当前页详情弹窗（含封面/正文/公开评论）、深色主题顶栏自适应均生效；登录态下门户与后台 `/overView` 互不干扰。修复了匿名进入公开页时占位路由导致顶栏发 401 请求被强制跳登录的问题（改为路由就绪后再挂载 + 未登录不查未读数）。
* 门户视觉优化（合并后在主仓库 dev server 复测）：Hero 与卡片改用主题变量驱动，切换 11 套预设与深浅色整体联动；无封面文章以主题色排印占位替代空灰块。修复搜索按钮被裁切、门户顶部 64px 死区（全局 `#app` 为后台固定顶栏预留）、入场动画覆盖悬停上浮、深色下 logo 不可见。实测顶栏贴顶、10 张卡片中 8 张走占位、浅色/深色/sakura 预设/390px 移动端均正常。
* 门户重构为四页结构（2026-10-26）：原先所有内容堆在 `/portal` 一页，现拆为首页、文章、摄影、随笔四个路由；首页只保留「Hero + 分类索引 + 最新 6 篇 + 照片墙预览 + 随笔卡片 + 标签云」，其余深度内容进入各自归档页。同时移除已废弃的 `PortalGalleryStrip`/`PortalDiaryStrip`/`PortalArticleCard` 三个组件，详情弹窗改为按内容自适应高度（不再固定 `calc(100vh - 148px)` 造成大片留白）。浏览器实测：四页渲染正常、文章搜索与标签/分类筛选生效并同步 URL、三个详情弹窗打开正常、浅色/深色/摩卡棕预设联动、390px 移动端单列自适应、后台 `/loginRegister` 不受门户顶栏补偿影响。已通过后端 117 项测试与前端 `vue-tsc` + Vite 生产构建。
* 文章、图库、文件、日记、评论/消息、总览统计卡片、访问量/数据监测图表均已在本地环境完成端到端验证；图库与文章分组的共用关系已实测（分组计数按内容类型隔离，删除保护生效）。
* 门户互动（2026-10-26）：匿名访问文章弹窗时评论框禁用并显示登录入口，点赞提示登录；登录后点赞 12→13、列表同步为 13，再点取消恢复 12；发表评论后详情与列表评论数 1→2，评论立即回显、输入清空、字数回到 `0/512`，浏览器控制台无报错。同时修复登录普通用户访问门户时只看到自己文章的权限串用问题；公开接口现始终只返回已发布内容。
* 天气字典已与前端 8 种图标对齐，旧字典行（晴/阴/雨/雪）已清理，日记引用无悬挂。
* 门户浏览量与热度排序（2026-10-26）：新增 `view_log` 去重表与 article/diary 的 views 计数列，迁移 `20261026_view_stats` 已在本地测试库验证（表与列均建立、迁移登记成功、计数后还原原值）。浏览器实测：三个归档页「最新 / 最热」切换即时重排，打开详情后列表浏览量即时回写，匿名/登录态分别按 IP 与用户ID 去重（30 分钟窗口）。已通过后端 137 项测试与前端 `vue-tsc` + Vite 生产构建。
* 门户随笔天气筛选（2026-10-26）：`/api/public/diary` 新增 `weather` 参数走 SQL 过滤，翻页后筛选不再失效；天气标签数量改由后端全量统计并随列表回传（`weatherFacet` / `facetTotal`），不再因只有当前页数据而跳变。本地测试库实测 7 种天气的列表数与分面数完全一致，浏览器实测 `?weather=晴天` 卡片全部为晴天且与 `sort=hot` 可叠加。已通过后端 163 项测试与前端 `vue-tsc` + Vite 生产构建。
* 后台视觉与响应式（2026-10-27）：统一后台侧栏、顶栏、主题下拉、统计卡、列表和编辑页样式，修复选中菜单图标阴影、用户管理筛选高亮和统计口径；文件/图库分页按网格实际宽度计算，私信按视口高度计算。浏览器实测 1440、2560 和 900 宽度：图库编辑左右卡片分别为 `624/624px`、`1128/1128px`，900px 自动切为单列；评论分页位于内容分隔线下方；图库初始化只发一次列表请求；侧栏始终只有当前菜单高亮。`npm run build` 完整通过。

# LinBlog数据库

## 文档概述

### 文档目的

本文档用于详细说明 LinBlog 个人博客系统数据库的设计结构、初始化逻辑、使用方法及注意事项，为开发、测试及维护人员提供完整的数据库参考。

### 数据库基本信息

- 数据库名称：`linlog`
- 字符集：`utf8mb4`（支持 emoji 及特殊字符）
- 排序规则：`utf8mb4_unicode_ci`
- 连接方式：MySQL 连接池（默认最大连接数 20）
- 核心功能：支撑用户管理、文章 / 资源存储、互动（点赞 / 评论）、日记、消息通知等业务场景

## 数据库设计详情

### 表结构总览

系统共设计 12 张数据表，按业务模块分类如下：

- 用户模块：`users`（用户表）
- 资源分类模块：`subset`（资源分类表）
- 内容模块：`article`（文章 / 图片集表）、`file`（文件存储表）
- 互动模块：`praise`（点赞表）、`comment`（评论表）
- 字典模块：`label`（标签字典表）、`weather`（天气字典表）
- 个人模块：`diary`（个人日记表）
- 通知模块：`message`（消息表）
- 统计模块：`record`（访问记录表）、`system_log`（系统日志表）

### 表结构详情

#### 用户表（users）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 用户ID（兼容雪花算法）                |
| username       | VARCHAR(50)                       | 非空、唯一索引（uk_username）                                               | 用户名（唯一）                        |
| mail           | VARCHAR(100)                      | 非空、唯一索引（uk_mail）                                                   | 邮箱（登录账号，唯一）                |
| password       | VARCHAR(255)                      | 非空                                                                       | 密码（bcrypt哈希存储，不可明文存储）  |
| user_type      | ENUM('admin', 'editor', 'normal', 'visitor') | 非空、默认值 `normal`                                               | 用户类型：管理员/编辑/普通用户/游客   |
| imgurl         | VARCHAR(255)                      | 可选（允许为NULL）                                                         | 头像图片URL地址                       |
| status         | TINYINT(1)                        | 非空、默认值 `1`、普通索引（idx_status）                                    | 账号状态：1-正常，0-禁用              |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 账号创建时间                          |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 账号信息更新时间（自动触发）          |
| last_login_at  | DATETIME                          | 可选（允许为NULL）                                                         | 最后登录时间                          |

####  资源分类表（subset）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | INT UNSIGNED                      | 主键、自增                                                                 | 分类ID                                |
| subset_name    | VARCHAR(50)                       | 非空                                                                       | 分类名称                              |
| classify       | ENUM('article', 'image', 'resource') | 非空、普通索引（idx_classify）                                           | 分类类型：文章/图片/资源              |
| status         | TINYINT(1)                        | 非空、默认值 `1`、普通索引（idx_status）                                    | 状态：1-启用，0-禁用                  |
| sort           | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 排序权重（数值越大，展示越靠前）      |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 创建时间                              |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 更新时间（自动触发）                  |
| 联合约束       | ——                                | 唯一索引（uk_subset_classify：subset_name + classify）                       | 同一类型下分类名称不可重复            |

#### 文件存储表（file）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 文件ID                                |
| file_name      | VARCHAR(100)                      | 非空                                                                       | 文件原始名称（含后缀）                |
| format         | VARCHAR(32)                       | 非空、普通索引（idx_format）                                                | 文件格式（如jpg、pdf、zip）           |
| size           | INT UNSIGNED                      | 可选（允许为NULL）                                                         | 文件大小（单位：字节）                |
| url            | VARCHAR(255)                      | 非空                                                                       | 文件存储地址（本地路径或云存储URL）    |
| subset_id      | INT UNSIGNED                      | 可选（允许为NULL）、普通索引（idx_subset）、外键（关联 subset.id）           | 所属分类ID（分类删除时设为NULL）      |
| status         | TINYINT(1)                        | 非空、默认值 `1`、普通索引（idx_status）                                    | 状态：1-正常，0-已删除                |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 文件上传时间                          |
| 外键规则       | ——                                | FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL            | 分类删除时，关联文件的分类ID设为NULL  |

####  文章/图片集表（article）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 文章/图片集ID                         |
| user_id        | BIGINT UNSIGNED                   | 可选（允许为NULL）、普通索引（idx_article_user）、外键（关联 users.id）       | 作者ID（删除用户时设为NULL）          |
| title          | VARCHAR(150)                      | 非空                                                                       | 标题（文章/图片集名称）               |
| subset_id      | INT UNSIGNED                      | 可选（允许为NULL）、普通索引（idx_subset）、外键（关联 subset.id）           | 所属分类ID（分类删除时设为NULL）      |
| classify       | ENUM('article', 'image')          | 非空、普通索引（idx_classify）                                             | 内容类型：文章/图片集                 |
| label          | VARCHAR(100)                      | 可选（允许为NULL）                                                         | 标签（多个标签用逗号分隔，如“Vue,JavaScript”） |
| introduce      | VARCHAR(512)                      | 可选（允许为NULL）                                                         | 简介（不超过512个字符）               |
| content        | LONGTEXT                          | 非空                                                                       | 内容（文章为HTML文本，图片集为说明文本） |
| cover          | VARCHAR(255)                      | 可选（允许为NULL）                                                         | 封面图片URL地址                       |
| views          | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 查看次数（冗余字段，提升查询效率）    |
| likes          | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 点赞数（冗余字段）                    |
| comments       | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 评论数（冗余字段）                    |
| state          | ENUM('draft', 'published', 'rejected', 'deleted') | 非空、默认值 `draft`、普通索引（idx_state）                           | 状态：草稿/已发布/已驳回/已删除       |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 创建时间                              |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 更新时间（自动触发）                  |
| published_at    | DATETIME                          | 可选（允许为NULL）                                                         | 发布时间（仅已发布状态有效）          |
| 索引补充       | ——                                | 全文索引（ft_title_intro：title + introduce）                               | 支持标题+简介的模糊搜索                |
| 外键规则       | ——                                | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL               | 作者删除时保留内容并清空作者ID        |
| 外键规则       | ——                                | FOREIGN KEY (subset_id) REFERENCES subset(id) ON DELETE SET NULL            | 分类删除时，关联内容的分类ID设为NULL  |

####  点赞表（praise）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 点赞记录ID                            |
| user_id        | BIGINT UNSIGNED                   | 非空、外键（关联 users.id）                                                | 点赞用户ID                            |
| article_id     | BIGINT UNSIGNED                   | 非空、外键（关联 article.id）                                              | 关联文章/图片集ID                     |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 点赞时间                              |
| 联合约束       | ——                                | 唯一索引（uk_user_article：user_id + article_id）                            | 同一用户对同一内容仅能点赞一次        |
| 外键规则       | ——                                | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE                | 用户删除时，关联点赞记录级联删除      |
| 外键规则       | ——                                | FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE           | 内容删除时，关联点赞记录级联删除      |

#### 评论表（comment）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 评论ID                                |
| user_id        | BIGINT UNSIGNED                   | 非空、普通索引（idx_user）、外键（关联 users.id）                            | 评论用户ID                            |
| article_id     | BIGINT UNSIGNED                   | 非空、普通索引（idx_article）、外键（关联 article.id）                       | 关联文章/图片集ID                     |
| parent_id      | BIGINT UNSIGNED                   | 非空、默认值 `0`、普通索引（idx_parent）                                     | 父评论ID（0表示一级评论，非0表示回复） |
| content        | VARCHAR(512)                      | 非空                                                                       | 评论内容（不超过512个字符）           |
| complaint      | INT UNSIGNED                      | 非空、默认值 `0`                                                           | 举报次数                              |
| is_read        | TINYINT(1)                        | 非空、默认值 `0`、普通索引（idx_is_read）                                    | 是否已读：1-是，0-否（针对回复通知）  |
| status         | TINYINT(1)                        | 非空、默认值 `1`                                                           | 状态：1-正常，0-已删除                |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 评论时间                              |
| 外键规则       | ——                                | FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE                | 用户删除时，关联评论级联删除          |
| 外键规则       | ——                                | FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE           | 内容删除时，关联评论级联删除          |

####  标签字典表（label）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | INT UNSIGNED                      | 主键、自增                                                                 | 标签ID                                |
| label_name     | VARCHAR(30)                       | 非空、唯一索引（uk_label_name）                                             | 标签名称（唯一，如“JavaScript”）      |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 创建时间                              |

#### 个人日记表（diary）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 日记ID                                |
| title          | VARCHAR(100)                      | 非空                                                                       | 日记标题                              |
| content        | TEXT                              | 非空                                                                       | 日记内容                              |
| picture        | VARCHAR(512)                      | 可选（允许为NULL）                                                         | 图片地址（多个图片用逗号分隔）        |
| weather_id     | INT UNSIGNED                      | 可选（允许为NULL）、外键（关联 weather.id）                                 | 天气ID（天气字典删除时设为NULL）      |
| mood           | ENUM('happy', 'sad', 'angry', 'calm', 'excited', 'tired') | 非空、默认值 `calm`、普通索引（idx_mood）                           | 心情状态                              |
| status         | TINYINT(1)                        | 非空、默认值 `1`                                                           | 状态：1-正常，0-已删除                |
| created_at     | DATE                              | 非空、普通索引（idx_created_at）                                            | 记录日期（YYYY-MM-DD格式）            |
| updated_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`                 | 更新时间（自动触发）                  |
| 外键规则       | ——                                | FOREIGN KEY (weather_id) REFERENCES weather(id) ON DELETE SET NULL          | 天气字典删除时，关联天气ID设为NULL    |

#### 天气字典表（weather）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | INT UNSIGNED                      | 主键、自增                                                                 | 天气ID                                |
| weather_name   | VARCHAR(20)                       | 非空、唯一索引（uk_weather_name）                                           | 天气名称（唯一，如“晴、雨、雪”）      |
| icon           | VARCHAR(255)                      | 可选（允许为NULL）                                                         | 天气图标URL地址                       |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`                                            | 创建时间                              |

####  消息表（message）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 消息ID                                |
| sender_id      | BIGINT UNSIGNED                   | 非空、外键（关联 users.id）                                                | 发送者ID（系统消息可设为特殊用户ID）  |
| receiver_id    | BIGINT UNSIGNED                   | 非空、普通索引（idx_receiver）、外键（关联 users.id）                        | 接收者ID                              |
| content        | VARCHAR(512)                      | 非空                                                                       | 消息内容（不超过512个字符）           |
| is_read        | TINYINT(1)                        | 非空、默认值 `0`、普通索引（idx_is_read）                                    | 是否已读：1-是，0-否                  |
| type           | ENUM('system', 'private', 'notice') | 非空、普通索引（idx_type）                                               | 消息类型：系统消息/私信/通知          |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 发送时间                              |
| 外键规则       | ——                                | FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE              | 发送者删除时，关联消息级联删除        |
| 外键规则       | ——                                | FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE            | 接收者删除时，关联消息级联删除        |

#### 访问记录表（record）

| 字段名         | 数据类型                          | 约束/默认值                                                                 | 注释                                  |
|----------------|-----------------------------------|-----------------------------------------------------------------------------|---------------------------------------|
| id             | BIGINT UNSIGNED                   | 主键、自增                                                                 | 访问记录ID                            |
| user_id        | BIGINT UNSIGNED                   | 可选（允许为NULL）、普通索引（idx_user）                                    | 访问用户ID（游客为NULL）              |
| ip             | VARCHAR(64)                       | 非空、普通索引（idx_ip）                                                   | 访问IP地址                            |
| position       | VARCHAR(100)                      | 可选（允许为NULL）                                                         | 访问地理位置（如“北京市”）            |
| device         | VARCHAR(100)                      | 可选（允许为NULL）                                                         | 设备信息（如“iPhone 15”）             |
| browser        | VARCHAR(50)                       | 可选（允许为NULL）                                                         | 浏览器类型（如“Safari”）              |
| os             | VARCHAR(50)                       | 可选（允许为NULL）                                                         | 操作系统（如“iOS 17”）                |
| path           | VARCHAR(255)                      | 非空、普通索引（idx_path）                                                 | 访问路径（如“/article/1”）            |
| created_at     | TIMESTAMP                         | 非空、默认值 `CURRENT_TIMESTAMP`、普通索引（idx_created_at）                 | 访问时间                              |

### 表关系说明

#### 核心关系图谱

```
users（用户）
├── 1:N → article（文章/图片集）：一个用户可创建多条内容
├── 1:N → comment（评论）：一个用户可发多条评论
├── 1:N → praise（点赞）：一个用户可点赞多条内容
├── 1:N → message（消息）：一个用户可发送/接收多条消息
└── 1:N → record（访问记录）：一个用户可产生多条访问记录

subset（分类）
├── 1:N → article（文章/图片集）：一个分类包含多条内容
└── 1:N → file（文件）：一个分类包含多个文件

article（文章/图片集）
├── 1:N → comment（评论）：一条内容可有多条评论
└── 1:N → praise（点赞）：一条内容可有多条点赞

weather（天气）
└── 1:N → diary（日记）：一种天气可关联多条日记

label（标签）
└── N:1 → article（文章/图片集）：多个标签可关联同一内容（通过article.label字段关联）
```

#### 外键约束规则汇总

| 从表字段         | 主表字段       | 删除规则       | 说明                                  |
|------------------|----------------|----------------|---------------------------------------|
| file.subset_id   | subset.id      | ON DELETE SET NULL | 分类删除时，文件的分类ID设为NULL      |
| article.user_id  | users.id       | ON DELETE SET NULL | 作者删除时保留内容并清空作者ID        |
| article.subset_id| subset.id      | ON DELETE SET NULL | 分类删除时，内容的分类ID设为NULL      |
| diary.weather_id | weather.id     | ON DELETE SET NULL | 天气字典删除时，日记的天气ID设为NULL  |
| praise.user_id   | users.id       | ON DELETE CASCADE  | 用户删除时，点赞记录级联删除          |
| praise.article_id| article.id     | ON DELETE CASCADE  | 内容删除时，点赞记录级联删除          |
| comment.user_id  | users.id       | ON DELETE CASCADE  | 用户删除时，评论记录级联删除          |
| comment.article_id| article.id    | ON DELETE CASCADE  | 内容删除时，评论记录级联删除          |
| message.sender_id| users.id       | ON DELETE CASCADE  | 发送者删除时，消息记录级联删除        |
| message.receiver_id| users.id     | ON DELETE CASCADE  | 接收者删除时，消息记录级联删除        |

---
## 数据库初始化逻辑

### 初始化流程

每次启动都会执行幂等结构检查：

1. 创建数据库（`CREATE DATABASE IF NOT EXISTS`）。
2. 切换数据库并按依赖顺序创建 11 张表（`CREATE TABLE IF NOT EXISTS`）。
3. 创建 `schema_migrations` 并执行尚未登记的迁移。
4. 初始化业务连接池。

演示数据不随服务启动自动写入，需显式执行 `npm run db:seed`。

### 模拟数据说明

执行 `npm run db:seed` 时插入测试数据，方便开发调试：

- **用户数据**：5 个测试账号（管理员 / 编辑 / 普通用户 / 游客），默认密码 `123456`。
- **分类数据**：7 个分类（技术博客 / 生活随笔 / 风景摄影等）。
- **内容数据**：3 篇文章 / 图片集、4 个文件、8 个标签。
- **互动数据**：5 条点赞、7 条评论（含回复）。
- **个人数据**：3 条日记、8 条天气字典记录（名称与前端 `src/utils/weather.ts` 完全对齐）。
- **通知数据**：5 条消息（系统消息 / 私信 / 通知）。
- **统计数据**：5 条访问记录（含游客访问）。
- 播种过程在事务中执行，并以 `users` 表是否已有记录作为幂等判断；不再依赖文件标记。

### 连接池配置

| 配置项           | 配置值       | 说明                                  |
|------------------|--------------|---------------------------------------|
| connectionLimit  | 20           | 最大并发连接数                        |
| host             | 从config读取 | 数据库服务器地址                      |
| user             | 从config读取 | 数据库登录账号                        |
| password         | 从config读取 | 数据库登录密码                        |
| database         | 从config读取 | 目标数据库名（`LINBLOG_DB_NAME`）     |
| charset          | utf8mb4      | 字符集                                |
| connectTimeout   | 15000ms      | 连接超时时间                          |
| waitForConnections| true        | 连接耗尽时等待（而非直接报错）        |
| queueLimit       | 100          | 等待队列上限                          |
| supportBigNumbers| true         | 支持 BIGINT 等大数字类型              |
| bigNumberStrings | false        | 大数字返回 Number 类型（而非字符串）  |
| enableKeepAlive  | true         | 启用 TCP Keep-Alive                   |

---

## 数据库使用方法

### 模块引入与初始化

```javascript
//	引入数据库模块
const db = require('./model/db/dbnew')

// 项目启动时初始化数据库（必须先执行）
async function bootstrap() {
  try {
    // 等待数据库结构检查和迁移完成
    await db.initDatabase()
    console.log('数据库初始化成功，可正常执行查询操作')
  } catch (error) {
    console.error('数据库初始化失败：', error.message)
    process.exit(1) // 初始化失败则退出服务
  }
}

// 启动服务
bootstrap()
```

### 注意事项

- **初始化顺序**：所有数据库操作必须在 `initDatabase` 执行完成后进行，否则会报错 “连接池未初始化”。
- **参数绑定**：使用 `db.query` 时，必须通过数组传递参数（如示例中的 `[userId, 0]`），避免 SQL 注入。
- **外键约束**：操作关联表时，需确保主表存在对应记录（如新增文章时，`subset_id` 必须是 `subset` 表中存在的 ID）。
- **密码验证**：用户登录时，需用 `bcrypt.compare` 验证明文密码与数据库中存储的哈希值，不可直接比对字符串。
- **大字段处理**：`article.content` 为 LONGTEXT 类型，存储 HTML 时需注意转义特殊字符，避免 XSS 攻击。

## 维护与调试

### 重置数据库

当需要重新初始化数据库时，先备份并确认目标为本地/隔离测试库，然后执行：

1. 手动删除目标数据库，例如 `DROP DATABASE IF EXISTS linlog;`。
2. 在 `serve/` 执行 `npm run db:migrate` 重建库表并应用迁移。
3. 如需演示数据，执行 `npm run db:seed`。

### 常见问题排查

| 问题现象                              | 可能原因                              |
| :------------------------------------ | ------------------------------------- |
| 初始化失败，提示“数据库连接超时”      | MySQL服务未启动/端口占用/配置参数错误 |
| 插入数据时提示“外键约束失败”          | 关联的主表记录不存在                  |
| 查询无结果但数据存在                  | 字符集不匹配/索引失效                 |
| 连接池报错 “PROTOCOL_CONNECTION_LOST” | MySQL 服务断开连接                    |
