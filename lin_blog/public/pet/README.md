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
