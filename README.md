# WordHook

> 在网页上划词学英语：LLM 详解你能真正看懂的解释，朗读，存进 Anki。

一个给"读英文技术内容 / 新闻时遇到生词生句"场景准备的 Chrome 扩展。

在页面上选中任意英文 → 弹出结构化分析（音标、词性、大白话释义、双语例句；句子则给自然翻译、逐词直译、句式拆解、关键语法点）→ 用系统 TTS 朗读 → 存成 Anki 卡片 → 攒够了一键导出。

面向**零基础初学者**设计：不假设你懂任何语法术语，词性写"动词 / 名词"中文（不是 v. / n.），每个英文例句都配中文翻译，句式拆解讲"这句话在说什么、哪里转折"，而不是"主谓宾定状补"。

v0 内置 Hacker News 支持；扩展到其它站只是 `manifest.json` 改一行的事。

## 功能

- **划词触发**：在支持的站上选中任意英文，弹出悬浮窗
- **单词 / 句子两种模式**：按长度和标点自动判定，顶部按钮可手动切换
- **流式渲染**：边接收 LLM 输出边渲染分区，翻译大约 1 秒就出现，完整分析 5–8 秒
- **本地朗读**：调用系统 TTS，免费、离线、零成本
- **攒卡导出**：本地存卡，导出带头部指令的 `.txt`，Anki 一键导入
- **缓存**：同选区不重复查，省 token

## 安装

### 方式 A：下载 Release 包（推荐）

1. 下载 [wordhook-v0.1.0.zip](https://github.com/shenmuegit/WordHook/releases/download/v0.1.0/wordhook-v0.1.0.zip) 并解压
2. 打开 `chrome://extensions/`，右上角开启「**开发者模式**」
3. 点「**加载已解压的扩展程序**」，选解压后的文件夹

### 方式 B：从源码安装

1. clone 本仓库
2. 打开 `chrome://extensions/`，开启「开发者模式」
3. 点「加载已解压的扩展程序」，选 clone 下来的目录

## 首次使用

点扩展图标，在弹出的配置 popup 里填三项：

- **Base URL**：任意 OpenAI 兼容服务地址，例如 `https://api.deepseek.com/v1`
- **Model**：模型名，例如 `deepseek-v4-flash` / `gpt-4o-mini`
- **API Key**：你自己的 key

保存时浏览器会弹权限对话框（请求访问那个 API 域名），点「允许」。

然后去 https://news.ycombinator.com/ 划任意英文。

## 支持的 LLM 服务

任何说 OpenAI Chat Completions 协议的服务都行，包括：

- **DeepSeek**（推荐，便宜）：`https://api.deepseek.com/v1` + `deepseek-v4-flash`
- **OpenAI**：`https://api.openai.com/v1` + `gpt-4o-mini`
- **Moonshot / Kimi**：`https://api.moonshot.cn/v1` + `moonshot-v1-8k`
- **SiliconFlow / Together / Groq** 或任何 OpenAI 兼容中转

## Anki 自动朗读（可选，30 秒一次性设置）

导入 `.txt` 之后，去 Anki 改一次「问答题」卡片模板：

1. **工具 → 管理笔记类型**
2. 选「**问答题**」→ 右边点 **卡片**
3. 「正面内容模版」里在 `{{正面}}` 下面新加一行：

   ```
   {{tts en_US:正面}}
   ```

   英文版 Anki 字段叫 Front，把 `正面` 换成 `Front`。

4. 点**保存**。以后所有卡片正面英文自动朗读。

想换音色（可选）：

```
{{tts en_US voices=Microsoft_David:正面}}
```

扩展 popup 里也内置了同样的说明 + 一键复制按钮。

## 隐私

- API key 仅存在你本机 `chrome.storage.local`，不上传任何服务器
- 仅在 `news.ycombinator.com` 注入脚本
- 你划的文本会直接发到**你配置的 LLM 服务**，不经过我们任何中转
- 卡片数据仅本地存储，导出 `.txt` 也在本机生成

## 技术栈

- Manifest V3，零构建步骤，零依赖
- Service worker 负责 LLM 调用、SSE 流式解析、缓存、卡片持久化
- Content script 用 Shadow DOM 隔离样式注入悬浮窗，做选区检测、流式部分渲染
- Popup 是纯 HTML，处理配置和 Anki 卡片管理

## 项目状态

v0。先给自己用，顺手开源。详见 [`实施方案.txt`](实施方案.txt) 看原始设计思路和分阶段计划。

**v0 故意不做的事**：

- 云端 TTS（用浏览器自带 Web Speech）
- AnkiConnect 直推（只支持手动导入 `.txt`）
- 打包 `.apkg` 带预录音频
- 除 Hacker News 之外的站
- 账号 / 同步 / 跨设备

如果你用了一段时间觉得某条限制是真痛点，欢迎提 issue。

## 许可

MIT（请自行添加 LICENSE 文件）
