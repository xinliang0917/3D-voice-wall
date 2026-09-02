# 3D Voice Wall · 多语种 3D 语音弹幕墙

![项目预览](screen-check.png)

一个实时多语种 3D 语音弹幕墙。每次语音识别返回最终结果时，都会生成一段立体的 3D 文字，它在空间中悬浮、变形、坠落到地面，并触发撞击粒子特效；旧消息会逐渐淡出，让场景始终有界且保持流畅。

## 功能特性

- 多语种 3D 文字：中文、英文、日文、韩文、泰文、越南文、西里尔文、阿拉伯文（RTL）等
- 3D 弹幕动画：悬浮上升 -> 石柱化 -> 重力坠落 -> 撞击粒子、烟尘、光环与镜头震动
- 后处理效果：Bloom、色差、暗角
- 三种语音识别模式：云端 WebSocket 代理、浏览器 Web Speech、内置 Mock
- 实时状态 HUD、多语种统计、品牌 Logo 展示
- 无密钥 / 断网兜底：云端失败时自动切换 Mock，3D 场景仍可演示

## 技术栈

- React 18、TypeScript、Vite
- Three.js、React Three Fiber、three-text、postprocessing
- Zustand、framer-motion、lucide-react
- Express、ws、dotenv

## 快速开始

```bash
npm install
npm run setup:assets
npm run dev:full
```

`npm run setup:assets` 会复制 HarfBuzz WASM 到 `public/hb` 并下载 Noto 字体子集；`npm run dev:full` 会同时启动 Vite 前端（http://localhost:5173）和 Node 语音服务（http://localhost:8787），Vite 会把 `/ws/speech` 代理到后端。

生产模式：

```bash
npm run build
npm start
```

然后打开 http://localhost:8787，服务端会同时托管 React 构建产物和 `/ws/speech` ASR 代理。

## 语音识别配置

复制 `.env.example` 为 `.env` 并按需配置：

```env
SPEECH_PROVIDER=cloud
SPEECH_API_URL=https://your-provider/v1/audio/transcriptions
SPEECH_API_KEY=replace-me
SPEECH_MODEL=your-multilingual-model
```

- `SPEECH_PROVIDER=cloud`：通过后端 WebSocket 代理调用 OpenAI 兼容的 `/v1/audio/transcriptions` 接口
- `SPEECH_PROVIDER=mock`：使用内置模拟适配器，无需网络或密钥
- `VITE_SPEECH_PROVIDER=browser`：前端使用浏览器原生 Web Speech API（仅开发调试）
- `SPEECH_LANGUAGE`：留空时由 ASR 自动识别多语种；指定 `zh`、`ja` 等可固定语言提示

后端支持“拼音结果重试为中文”和“空结果候选语言重试”，可通过 `SPEECH_AUTO_RETRY_ZH`、`SPEECH_AUTO_LANGUAGES` 调整。

## 本地 FunASR

项目自带 FastAPI 版 FunASR 服务（`server/funasr/asr_server.py`）和启动脚本：

```powershell
npm run funasr
```

然后配置：

```env
SPEECH_PROVIDER=cloud
SPEECH_API_URL=http://127.0.0.1:8000/v1/audio/transcriptions
SPEECH_API_KEY=local
SPEECH_MODEL=iic/SenseVoiceSmall
```

验证：

```powershell
Invoke-RestMethod http://localhost:8000/
Invoke-RestMethod http://localhost:8787/api/health
```

## 项目结构

```text
src/                    React + Three.js 前端
  components/           3D 场景、HUD、控制栏等 UI
  three/                3D 文字、物理、后处理、布局
  speech/               前端语音提供商
  store/                Zustand 状态
server/                 Node 语音代理服务
  speech/               云端 / Mock ASR 适配器
  funasr/               本地 FunASR FastAPI 服务
public/                 字体、HarfBuzz WASM、Logo 等静态资源
scripts/                资源初始化与下载脚本
```

## 安全说明

- `.env` 及所有 `.env.*`（`.env.example` 除外）不会提交到 Git
- API Key 只存在于服务端配置中，不会进入 `src/` 或前端构建产物
- 前端通过 `/ws/speech` 与后端通信，浏览器不接触密钥
- 提交前请确认 `dist/`、`node_modules/`、本地缓存文件均已被 `.gitignore` 排除
