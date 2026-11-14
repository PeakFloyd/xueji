# 学籍管理系统 · 前端（Next.js）

```bash
bun install
bun dev        # http://localhost:3000
bun run build  # 生产构建
```

## 开场动画 `src/components/intro/`

首页是一段全屏开场动画（约 20 秒，5 段等长：动态字体 → 形状变形 → 2D 到 3D → 数据界面 → 片尾标题）。
浏览器只允许在用户手势之后播放声音，所以首屏是一个“点击授权”的门：点击或按 Enter/空格开始，Esc 或底部「跳过」直接到结尾，结尾可「重播」。系统开启“减少动态效果”时直接显示结尾画面。

| 文件 | 作用 |
|---|---|
| `Intro.tsx` | React 组件：门、播放、跳过/重播；画面以音频时钟为准，音画同步 |
| `engine/constants.ts` | 调色板、5 段时间、语音起点与节拍（取自音频实测的音节起点）、演示数据 |
| `engine/actors/*` | 每个“演员”负责自己的元素，整个时长内都是时间 `t` 的纯函数 |
| `engine/audio.ts` | 6 段语音 + Web Audio 合成音效（含压限、闪避），也可离线渲染整段混音 |
| `engine/glyphs.ts` | 由脚本生成：用于 “ID → ✓” 变形的字形轮廓 |
| `assets/intro-sans.woff2` | 唯一字体：Noto Sans SC 可变字重（100–900），按动画实际用到的字符子集化 |

改了动画里的文字后，重新生成字体子集与字形：

```bash
python scripts/build-intro-font.py   # 需要 fontTools、brotli；首次会下载源字体到 scripts/.cache/
```

逐帧检查：打开 `http://localhost:3000/?capture`，页面不播放，暴露
`window.__intro.seek(t)`（渲染第 t 秒的画面）和 `window.__intro.mix()`（离线渲染整段混音，返回 WAV 的 base64）。
