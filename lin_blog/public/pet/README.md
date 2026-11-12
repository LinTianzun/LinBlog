# dsh-pet 动画素材

本目录素材来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（MIT License），
原版为 640×360 VP9-alpha 透明 webm。为控制仓库体积，这里批量转码为 320×180 并保留 alpha 通道，
供 `src/components/common/DesktopPet.vue` 内嵌使用。

转码命令（需要 ffmpeg，注意必须显式指定 libvpx-vp9 解码器，否则 alpha 会被丢弃）：

```bash
ffmpeg -c:v libvpx-vp9 -i 原文件.webm \
  -c:v libvpx-vp9 -pix_fmt yuva420p -crf 40 -b:v 0 \
  -vf scale=320:180 -an 输出.webm
```

素材文件名即动画名（如 `待机呼吸休闲.webm`），组件按 `/pet/webm/<动画名>.webm` 引用。

## 组件能力

`src/components/common/DesktopPet.vue` 在素材之外提供：

- 站点级设置（需 `permission.edit`）：显示范围、大小/缩放、活泼程度、漫游、拖拽、气泡、不透明度、自动入睡、停靠角落。
- 本机访客偏好（所有访客）：本机隐藏、夜间安静时段（支持跨零点）、页脚与右下角爪印恢复入口。
- 页内行为：编辑器自动进入安静陪写模式，门户首页更活跃；尊重 `prefers-reduced-motion`。
- 互动养成：点击抚摸、喂食（60 秒冷却）、心情/饱腹/亲密度、每日首次问候、饿了提醒。
- 业务联动：文章/图库保存与发布、保存失败、新私信、新评论、评论成功、登录退出、设置保存。

## 性能与缓存

- 页面隐藏时暂停两路视频、漫游与轮询，回到前台再恢复。
- 空闲时只预取少量高频动画（待机、点击、睡觉、碎碎念），不会一次加载全部素材。
- 检测到 `navigator.connection.saveData` 或 2G 网络时跳过预取。
- `serve/linlog.js` 对 `dist/pet/` 与 `dist/assets/` 一样设置一年 immutable 缓存；其余前端文件保持 `no-cache`。

## 授权

素材与移植思路来自 MIT License 的 dsh-pet。修改或再分发时请保留原项目署名与许可证信息。
