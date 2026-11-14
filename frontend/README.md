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

## 主界面 `src/components/xueji/`

开场动画结束的那一帧，界面以**逐像素相同**的副本接管画面（之后才移除动画层），随后同一批元素继续运动：
光标倒退擦去标题、标签翻成 IDENTITY → 身份验证门；验证通过后学号沉入横线、姓名升起，整组标识停靠到左上 → 主界面。全程不切镜、不交叉淡化。

| 文件 | 作用 |
|---|---|
| `Experience.tsx` | 开场动画 → 主界面的交接（动画层在副本上屏后再卸载） |
| `XuejiApp.tsx` | 画框适配、渲染循环、阶段：gate → verifying → entering → console → leaving |
| `scene.ts` | 持久的 SVG 图形层：信箱黑边、HUD、标识组（标签/大字/横线/说明/印章）、光标、描边字；纯时间函数，延续开场的运动规则 |
| `Gate.tsx` | 身份验证门（隐形输入框驱动巨型字、演示身份） |
| `Console.tsx` / `Stage.tsx` | 主界面：快捷指令、命令行（自绘光标）、结果舞台（扫描线、处理过程、拒绝/写入确认/盖章） |
| `Facts.tsx` | 按后端事实 `kind` 渲染：学分、选课成绩、人数（单位方块）、各系、授课概况、成绩分布、不及格名单、名册墙… |
| `api.ts` | 浏览器端：`/api/xueji/*` 调用与 SSE 解析（只以 `done` 为准） |
| `assets/xueji-ui.woff2` | 界面字体：同一款 Noto Sans SC 可变字重，GB2312 全集 + 演示数据与源码用字 |

**后端代理** `src/app/api/xueji/{session,chat,confirm,health}`：浏览器从不接触后端 sessionId（httpOnly Cookie）；
地址默认 `http://127.0.0.1:8090`，可用 `AGENT_API_URL` 覆盖。登录后界面会自动发出该角色的第一条指令作为“开场简报”（一次模型调用）。

快捷方式：`/?skip` 直接进入身份验证门；命令行里 `Alt+1…n` 触发快捷指令，`/` 聚焦命令行。系统开启“减少动态效果”时所有过渡立即完成。
审阅用：`/?freeze` 停在交接首帧（可与 `/?capture` + `seek(20)` 逐像素比对），`window.__xueji.login(id)` 直接登录。

改了界面里的文字后（或字体缺字时）重建字体：

```bash
python scripts/build-ui-font.py
```
