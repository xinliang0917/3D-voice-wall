# 3D 多语种语音墙 Web 项目生成提示词

你是一名资深 **Creative Developer + Three.js / WebGL 工程师 + React 工程师 + 交互视觉设计师**。

请直接生成一个完整、可运行、工程化的 **3D Multilingual Voice Wall（多语种 3D 语音墙）** Web 项目。

这个项目不是普通的字幕网站，也不是普通 2D 弹幕，而是一个：

> **实时语音 → 多语种识别 → 3D 文字生成 → 文字高速弹射 → 3D 空间堆积 → 形成持续生长的语音墙**

的沉浸式数字艺术网页。

------

# 一、必须参考的 GitHub 开源项目

在开始编码之前，先研究并参考以下 GitHub 项目的架构、实现方式和视觉效果。

## 1. three-text

GitHub：

https://github.com/countertype/three-text

这是本项目最重要的参考项目。

重点参考：

- 3D Font Rendering
- 3D Mesh Text
- Extrusion
- Text Layout
- Glyph Cache
- CJK 支持
- RTL 支持
- Variable Font
- Three.js Adapter
- React Three Fiber Adapter

不要自行重新实现复杂的多语言字体解析系统。

优先使用 `three-text` 的能力作为本项目的 3D 字体底层。

重点目标：

```text
中文
English
日本語
한국어
العربية
Français
Español
Deutsch
```

都能够正常显示。

注意：

`three-text` 当前属于 alpha API。

因此：

1. 固定依赖版本。
2. 不要自动升级 three-text。
3. 把 three-text 封装在自己的 `TextRenderer3D` 组件中。
4. 业务代码不要直接依赖其内部 API。
5. 如果以后更换文字渲染库，只修改 Adapter。

------

# 二、第二个参考：Lexical

GitHub：

https://github.com/globe-and-atlas/lexical

重点参考：

- 3D word-space
- WebGL text visualization
- React Three Fiber
- Drei Text
- OrbitControls
- Bloom
- Chromatic Aberration
- Vignette
- 3D 空间布局
- 文本到空间坐标的映射
- cinematic post-processing

不要照搬 Lexical 的“单词频率 → 坐标”逻辑。

本项目需要的是：

```text
Voice Message
        ↓
Spatial Packing
        ↓
3D Wall Position
```

而不是：

```text
word → character code → position
```

可以参考它的：

- Scene 结构
- Camera
- PostProcessing
- Bloom
- 视觉层级
- 文字空间分布

------

# 三、第三个参考：three-particles

GitHub：

https://github.com/NewKrok/three-particles

重点参考：

- Particle System
- gravity
- force fields
- directional forces
- updateParticleSystems
- runtime configuration
- particle animation
- particle physics

本项目可以把它用于：

```text
3D Text Flying
      ↓
Motion Trail
      ↓
Particle Burst
      ↓
Impact Effect
```

不要让粒子系统取代 3D 文字本身。

核心仍然是：

**真正的 3D Typography。**

粒子只是辅助效果。

------

# 四、第四个参考：particle-text-3d

GitHub：

https://github.com/sebastianvasquezechavarria1234/particle-text-3d

重点参考：

- Canvas text sampling
- Particle typography
- Shader
- Bloom
- Background particles
- Mouse interaction
- Click explosion
- BufferGeometry
- Float32Array
- DynamicDrawUsage
- GPU performance optimization

尤其参考它的：

```text
直接操作 Float32Array
+
避免动画过程中不断创建对象
+
Bloom
+
Background Particle
+
Shader
```

本项目不要直接把所有语音文字变成几千个粒子。

最终语音墙中的主要文字仍然必须是：

**可阅读的 3D Text Mesh。**

Particle Text 用于：

- 背景
- 入场拖尾
- 消散
- 旧文字淡化
- 特效

------

# 五、第五个参考：threejs-text-particle-effect

GitHub：

https://github.com/shahbaziparisa/threejs-text-particle-effect

重点参考：

- 3D Text
- Particle animation
- Matcap
- Gradient Material
- Liquid Gradient
- 动态背景
- Camera Orbit
- 文字和粒子组合

尤其参考它的：

```text
Text + Particle + Material + Camera
```

组合方式。

但本项目不要直接复制其 UI 或主题。

------

# 六、重要原则：参考代码，而不是简单复制项目

请遵守：

> 学习上述项目的实现方式、架构和算法思想，将其组合成一个新的项目。

不要：

- 直接复制整个仓库
- 大量复制 README
- 原封不动复制页面
- 直接拼接几个 Demo
- 生成一个“GitHub Demo 集合页”

最终必须是一个完整的新产品：

# MULTILINGUAL 3D VOICE WALL

------

# 七、项目技术栈

使用：

```text
React
TypeScript
Vite
Three.js
@react-three/fiber
@react-three/drei
three-text
Zustand
Framer Motion
Web Audio API
```

后处理：

```text
@react-three/postprocessing
postprocessing
```

如果使用 GitHub 项目中依赖的旧版本 postprocessing，需要根据实际兼容性固定版本。

不要随意升级：

```text
three
@react-three/fiber
@react-three/postprocessing
postprocessing
three-text
```

------

# 八、页面核心概念

页面中央建立一个真正的 3D Voice Wall。

结构：

```text
                    CAMERA

                      ↓

          文字从前方高速飞入

             ↘      ↓      ↙
               ↘    ↓    ↙
                 VOICE
                  WALL

        中文   Hello   日本語

     한국어       Bonjour       Hola

       Hello Everyone

               ↑

       新文字不断加入
```

------

# 九、3D Voice Wall

墙体使用 Three.js。

不要使用：

```text
<div>
```

来模拟 3D 墙。

必须是真正的：

```text
THREE.Scene
THREE.PerspectiveCamera
THREE.Mesh
THREE.Group
```

墙面建议：

```text
width = 18
height = 10
depth = 0.25
```

材质：

- 极低透明度
- 白色 / 淡蓝色
- 微弱玻璃感
- 边缘微光

墙体不能抢文字视觉。

可以只通过：

```text
soft glow
subtle grid
edge light
```

暗示墙面存在。

------

# 十、3D 文字系统

建立：

```text
VoiceText3D
```

组件。

每条语音都是一个独立 3D Object。

例如：

```text
你好，很高兴认识大家
```

生成：

```text
VoiceText3D
```

属性：

```ts
{
  text,
  language,
  languageCode,
  confidence,
  timestamp
}
```

通过 `three-text` 或封装后的 Text Renderer 创建。

必须支持：

- 中文
- 英文
- 日文
- 韩文
- 阿拉伯文
- 欧洲语言

------

# 十一、3D 文字必须具有厚度

文字不能是：

```text
Text Sprite
```

也不能是：

```text
CanvasTexture
```

作为最终主体。

应该尽可能使用：

```text
extruded 3D mesh
```

形成：

```text
Front Face
+
Side Face
+
Depth
```

例如：

```text
extrusion ≈ 0.04 ~ 0.10
```

让文字从侧面观察时也是真正的 3D 物体。

------

# 十二、文字飞行动画

这是项目最核心的效果。

每条新语音：

```text
Spawn
 ↓
Accelerate
 ↓
Fly
 ↓
Approach Wall
 ↓
Decelerate
 ↓
Settle
 ↓
Fixed
```

------

# 十三、文字 Spawn

文字生成位置应该位于摄像机前方。

例如：

```text
x = random(-5, 5)
y = random(-4, 4)
z = 5 ~ 8
```

文字略微旋转。

例如：

```text
rotationX = random(-0.15, 0.15)
rotationY = random(-0.15, 0.15)
rotationZ = random(-0.1, 0.1)
```

------

# 十四、文字飞行

参考 `three-particles` 的运动思想实现：

- velocity
- acceleration
- force
- easing

但不要让文字看起来像物理爆炸。

应该像：

> **文字被高速发射到墙面。**

推荐：

```text
easeOutExpo
```

或者：

```text
spring + damping
```

飞行过程中可以产生：

```text
motion trail
particles
light streak
```

------

# 十五、撞墙 / 到达墙面

文字到达 Wall：

```text
speed ↓
rotation → 0
scale → 1
opacity → 1
```

最后存在于墙面空间。

------

# 十六、空间堆积算法

这是第二个最重要的模块。

不能：

```text
第一行
第二行
第三行
```

简单排版。

必须做：

# Spatial Text Packing

输入：

```text
text bounding box
```

输出：

```text
x
y
z
rotation
```

------

## 第一版实现

使用：

```text
Random Sampling
+
Bounding Box Collision
```

算法：

```text
generate candidate position

↓

calculate bounding box

↓

check overlap

↓

if overlap:
    generate new candidate

↓

if valid:
    accept
```

每个文字：

```text
最多尝试 30 次
```

------

# 十七、3D 堆积

不要只在 Z=0。

允许：

```text
z = -0.35
z = -0.20
z = -0.10
z = 0
z = 0.10
z = 0.20
```

形成前后层次。

让视觉产生：

```text
前景文字
中景文字
背景文字
```

这样才能真正形成：

**3D Voice Wall**

------

# 十八、文字大小

文字大小根据内容长度动态调整。

例如：

```text
短句：
fontSize = 0.75

中等：
fontSize = 0.55

长句：
fontSize = 0.38
```

中文与英文要进行不同的字符宽度估计。

不要出现：

```text
Hello everyone...
```

因为太长而占据整个墙面。

需要：

```text
maxTextWidth
```

超过以后：

```text
自动缩小
```

------

# 十九、语言视觉识别

所有文字视觉保持统一。

不要：

```text
中文 = 红色
英文 = 蓝色
日文 = 绿色
```

这种廉价分类。

建议主体统一：

```text
white
cool white
cyan blue
```

语言只通过小型标签显示：

```text
中文
EN
日本語
한국어
FR
ES
```

------

# 二十、文字层级

最新加入的文字：

```text
high brightness
high opacity
slightly larger
closer to camera
```

较旧文字：

```text
lower brightness
lower opacity
slightly farther away
```

形成时间层次。

------

# 二十一、视觉特效

参考：

- Lexical 的 Bloom
- particle-text-3d 的 Bloom
- threejs-text-particle-effect 的材质思想

加入：

```text
Bloom
Vignette
very subtle Chromatic Aberration
```

但强度必须克制。

参考范围：

```text
Bloom intensity:
0.5 ~ 1.0
```

不要让整个页面变成霓虹灯。

------

# 二十二、背景

背景采用：

```text
#F7FBFF
```

或者非常浅的：

```text
white → cyan → violet
```

渐变。

背景增加：

```text
300~600 particles
```

粒子参考：

```
particle-text-3d
```

使用：

```text
sin()
cos()
```

产生缓慢漂浮。

------

# 二十三、当前实时语音

顶部中央：

```text
LIVE RECOGNITION
```

下面：

```text
Chinese · 中文
```

以及：

```text
你好，很高兴认识大家
```

必须能够实时刷新。

------

# 二十四、Partial Recognition

用户还在说：

```text
你好，我今天想
```

显示在中央。

继续说：

```text
你好，我今天想和大家分享一个故事
```

实时更新。

但是：

**Partial Result 不进入永久语音墙。**

只有：

```text
isFinal === true
```

才生成 VoiceText3D。

------

# 二十五、语音数据流

定义：

```ts
interface SpeechResult {
  text: string
  language: string
  languageCode: string
  confidence: number
  isFinal: boolean
  timestamp: number
}
```

最终转换：

```ts
interface VoiceMessage {
  id: string
  text: string
  language: string
  languageCode: string
  confidence: number
  timestamp: number

  position: THREE.Vector3

  rotation: THREE.Euler

  scale: number

  status:
    | "spawn"
    | "flying"
    | "settling"
    | "fixed"
}
```

------

# 二十六、语音 Provider 架构

必须设计：

```text
SpeechRecognitionProvider
```

接口：

```ts
interface SpeechRecognitionProvider {
  start(): Promise<void>
  stop(): Promise<void>

  onPartialResult(
    callback: (result: SpeechResult) => void
  ): void

  onFinalResult(
    callback: (result: SpeechResult) => void
  ): void

  onError(
    callback: (error: Error) => void
  ): void
}
```

实现：

```text
MockSpeechProvider
BrowserSpeechProvider
WebSocketSpeechProvider
```

------

# 二十七、Mock 模式

项目没有真实 AI API 时必须正常运行。

提供：

```text
DEMO
```

按钮。

自动生成：

```text
你好，欢迎来到语音墙
Hello everyone
こんにちは
안녕하세요
Bonjour à tous
Hola a todos
Selamat datang
Xin chào mọi người
```

每隔：

```text
1 ~ 3 秒
```

随机生成一条。

------

# 二十八、真实麦克风

点击：

```text
START VOICE
```

以后：

```text
navigator.mediaDevices.getUserMedia()
```

获取麦克风。

显示：

```text
● LISTENING
```

同时使用：

```text
Web Audio API
AnalyserNode
```

生成：

```text
实时声音波形
```

------

# 二十九、多语种模型预留

最终：

```text
Browser
 ↓
AudioStream
 ↓
WebSocket
 ↓
ASR
 ↓
Language Detection
 ↓
SpeechResult
 ↓
Frontend
```

前端不能绑定任何具体 AI 平台。

例如以后可以接：

```text
OpenAI
Azure
Google Cloud
Deepgram
自建 Whisper
FunASR
其他多语种 ASR
```

但是现在不要把任何模型 API 写死。

------

# 三十、数据流

```text
Microphone
   ↓
AudioStream
   ↓
Speech Provider
   ↓
Partial Result
   ↓
CurrentRecognition
```

Final：

```text
Final Result
   ↓
Voice Store
   ↓
Language Statistics
   ↓
VoiceText3D
   ↓
Spatial Packing
   ↓
Flight Animation
   ↓
Voice Wall
```

------

# 三十一、UI 设计

不要制作成 Dashboard。

必须是：

# Digital Art Installation

UI 极少。

顶部：

```text
3D VOICE WALL

MULTILINGUAL AI INTERACTION
```

右上：

```text
● LIVE
15 LANGUAGES
```

左下：

```text
LANGUAGE ACTIVITY

中文      12
English   8
日本語     6
한국어     4
```

右下：

```text
🎙 Start
▶ Demo
↻ Reset
```

------

# 三十二、Hover 文字

鼠标悬停：

```text
scale × 1.08
brightness ↑
z + 0.15
```

显示：

```text
Japanese
Confidence 96%
17:38:21
```

------

# 三十三、鼠标视差

参考 Lexical 的 OrbitControls。

但是默认不要让用户疯狂旋转。

可以：

```text
mouse movement
→ subtle camera parallax
```

拖拽：

```text
OrbitControls
```

缩放：

```text
Wheel
```

------

# 三十四、性能要求

必须借鉴 `particle-text-3d` 的优化理念。

不要：

```text
每一帧 new THREE.Vector3()
每一帧 new THREE.Box3()
每一帧创建 React state
```

动画循环中尽量：

```text
reuse objects
reuse arrays
reuse geometry
reuse materials
```

使用：

```text
Float32Array
DynamicDrawUsage
```

------

# 三十五、文字数量

默认：

```text
MAX_VISIBLE_MESSAGES = 80
```

最多：

```text
120
```

当超出：

```text
最旧文字
→ opacity ↓
→ scale ↓
→ remove
```

而不是无限增加。

------

# 三十六、重要：文字与粒子分层

场景分为：

```text
Layer 1
Background Particles

Layer 2
Ambient Glow

Layer 3
Flying Voice Text

Layer 4
Fixed Voice Text

Layer 5
Current Recognition

Layer 6
UI
```

最新文字必须最清晰。

------

# 三十七、项目目录

生成：

```text
src/

├── components/
│   ├── VoiceWall.tsx
│   ├── VoiceText3D.tsx
│   ├── VoiceTextManager.tsx
│   ├── FlyingText.tsx
│   ├── BackgroundParticles.tsx
│   ├── CurrentRecognition.tsx
│   ├── LanguageStats.tsx
│   ├── VoiceVisualizer.tsx
│   ├── SystemStatus.tsx
│   └── ControlBar.tsx
│
├── three/
│   ├── TextRenderer3D.ts
│   ├── SpatialPacking.ts
│   ├── TextCollision.ts
│   ├── FlightAnimation.ts
│   ├── ParticleEffects.ts
│   └── PostProcessing.tsx
│
├── speech/
│   ├── SpeechRecognitionProvider.ts
│   ├── MockSpeechProvider.ts
│   ├── BrowserSpeechProvider.ts
│   └── WebSocketSpeechProvider.ts
│
├── store/
│   └── voiceStore.ts
│
├── types/
│   └── voice.ts
│
├── utils/
│   ├── language.ts
│   ├── textMeasure.ts
│   └── performance.ts
│
├── App.tsx
├── main.tsx
└── index.css
```

------

# 三十八、开发步骤

请不要一次性先做全部功能。

严格按照：

## Step 1

先实现：

```text
Three.js Scene
Camera
Wall
Lights
Background
```

------

## Step 2

接入：

```text
three-text
```

实现：

```text
中文
English
日本語
한국어
```

3D 文字。

------

## Step 3

实现：

```text
VoiceText3D
```

能够：

```text
spawn
fly
settle
fixed
```

------

## Step 4

实现：

```text
SpatialPacking
```

确保文字不会完全重叠。

------

## Step 5

实现：

```text
Particle Trail
Bloom
Background Particle
```

参考：

- three-particles
- particle-text-3d

------

## Step 6

实现：

```text
MockSpeechProvider
```

让 Demo 模式跑起来。

------

## Step 7

接入：

```text
BrowserSpeechProvider
```

支持浏览器麦克风。

------

## Step 8

预留：

```text
WebSocketSpeechProvider
```

方便后续接 AI ASR。

------

# 三十九、最终必须实现的体验

网页打开：

```text
SPEAK
TO THE
VOICE WALL
```

用户点击：

```text
START
```

开始讲话：

```text
你好，欢迎大家来到这里
```

中央：

```text
中文 · 96%

你好，欢迎大家来到这里
```

然后：

```text
文字从摄像机前方出现
        ↓
高速向墙面飞行
        ↓
带轻微粒子拖尾
        ↓
靠近墙面减速
        ↓
产生微小弹性
        ↓
停在空间中
        ↓
成为 Voice Wall 的一部分
```

接下来用户说：

```text
Hello everyone
```

然后：

```text
Hello everyone
```

从另一个空间位置飞进来。

继续：

```text
こんにちは
```

再飞入。

最终形成：

```text
中文
English
日本語
한국어
Français
Español
```

不断增长的 3D 文字墙。

------

# 四十、最终视觉目标

不要做成：

```text
普通字幕
+
普通 Dashboard
+
普通 3D Word Cloud
```

而要达到：

> **声音实体化。**

用户说话以后，文字像一个有质量、有速度、有空间位置的物体，被发射进入整个 3D 世界。

最终：

# EVERY VOICE BECOMES A 3D MEMORY

------

# 四十一、代码生成要求

生成代码时：

1. 先创建完整可运行 MVP。
2. 不要只输出 Demo 片段。
3. 所有文件必须真实可运行。
4. TypeScript 不允许大量 `any`。
5. 组件之间保持低耦合。
6. Three.js 动画不能依赖高频 React state 更新。
7. 3D 对象生命周期必须明确。
8. 支持英文、中文、日文、韩文。
9. Mock 模式必须开箱即用。
10. 没有后端 API 时仍然可以完整展示视觉效果。
11. 对 GitHub 参考项目的代码进行合理封装，不要直接复制整个仓库。
12. 对 `three-text` 固定版本。
13. README 中明确说明哪些模块参考了哪些开源项目。
14. 给出最终运行命令：

```bash
npm install
npm run dev
```

并保证项目可以直接启动。

------

# 四十二、开发优先级

严格按照：

```text
3D文字质量
     ↓
文字飞行
     ↓
空间堆积
     ↓
视觉效果
     ↓
Mock语音
     ↓
真实麦克风
     ↓
多语种
     ↓
WebSocket
     ↓
AI模型
     ↓
性能优化
```

不要为了先接 AI 而牺牲 3D 核心视觉。