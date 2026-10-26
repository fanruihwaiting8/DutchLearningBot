# 荷兰语 B1 备考助手 (DutchLearningBot)

面向荷兰入籍考试(Inburgeringsexamen, B1)的备考工具，提供**网页版**(手机可用) 与 **macOS 桌面版**两种形态，共用同一套词库。

在线地址：<https://fanruihwaiting8.github.io/DutchLearningBot/>

## 网页版(推荐，手机优先)

纯静态页面，无后端、无需安装，手机浏览器打开即用；可「添加到主屏幕」当 App 使用，支持离线。

- ☀ **每日学习**（默认首页）：每天自动生成固定学习量的任务单，约 20 分钟做完，不含听力。
  - 15 个新词（学习卡）+ 15 个复习词（荷→中四选一）
  - 1 篇 B1 短文 + 3 道理解题（可显示中文对照、整篇朗读）
  - 8 句词序重组（点词块拼句）
  - 顶部进度条，三段全部做完才算当日达成，并累计**连续打卡天数**（streak）
  - 任务按日期种子生成：同一天刷新不变，到第二天自动换一批；新词优先没学过的，复习词优先做错过的
- 📋 **备考看板**：词汇 / 阅读 / 听力 / 写作 / 口语 / KNM / ONA / 语法 八个科目，显示各科就绪度（当前「词汇」「阅读」有内容，其余为后续阶段）。
- 📇 **闪卡**：正面荷兰语，点击翻面看中文与例句，可标记「已掌握」，支持朗读。
- 🔀 **双向选择**：随机 荷→中 或 中→荷，四选一自动判分。
- ✏️ **拼写**：根据中文写出荷兰语，回车提交，答错给出正确拼写并朗读。
- 📊 **学习统计**：已掌握数、累计答题、正确率、就绪度，可一键重置。
- 🔊 **朗读**：使用浏览器 Web Speech API(`nl-NL`)，需系统/浏览器装有荷兰语语音。

就绪度规则：取最近 20 题，正确率 ≥ 80% 记为达标（与桌面版一致）。

学习进度存在**浏览器本地** `localStorage`（答题进度 `dutch_b1_progress_v2`、每日打卡 `dutch_b1_daily_v1`），换设备或清缓存会丢失，与桌面版进度互不同步。

本地预览：

```bash
cd web && python3 -m http.server 8777
# 浏览器打开 http://127.0.0.1:8777/
# 手机在同一局域网内可访问 http://<电脑IP>:8777/
```

> `web/data.js` 直接内联词库，所以直接双击 `web/index.html`（`file://`）也能用。

## macOS 桌面版

需要 Python 3（自带 tkinter，macOS / Windows 官方 Python 均已内置）：

```bash
python3 main.py
```

桌面版进度保存在 `data/progress.json`（不入库）。

## 目录结构

```
DutchLearningBot/
├── main.py                 # 桌面版入口(tkinter)
├── core/
│   ├── store.py            # 进度存取、就绪度计算
│   └── tts.py              # 朗读(macOS say)
├── ui/                     # 桌面版界面:theme / dashboard / woorden / placeholder
├── data/
│   ├── vocabulary.json     # 词库(唯一数据源,可自行增删)
│   ├── lezen.json          # 阅读短文 + 理解题
│   ├── zinnen.json         # 词序重组用的句子
│   └── progress.json       # 桌面版学习进度(自动生成,已 gitignore)
├── tools/
│   └── build_web_data.py   # 由上面三个 json 生成 web/data.js
├── web/                    # 网页版(GitHub Pages 发布目录)
│   ├── index.html / styles.css / app.js
│   ├── daily.js            # 每日学习模块
│   ├── data.js             # 生成产物,勿手改
│   └── manifest.webmanifest / icon.svg / sw.js   # PWA
├── .github/workflows/pages.yml  # push 到 main 自动部署 web/ 到 Pages
└── DESIGN_B1.md            # B1 备考功能设计与 Roadmap
```

## 自定义词库

编辑 `data/vocabulary.json` 的 `words` 数组，每条格式：

```json
{
  "nl": "hallo",
  "zh": "你好",
  "cat": "问候与礼貌",
  "ex_nl": "Hallo, hoe gaat het?",
  "ex_zh": "你好,你最近怎么样?"
}
```

阅读素材在 `data/lezen.json`（`passages[]`，每篇含荷文、中文对照和 3 道题），重组句子在 `data/zinnen.json`（`sentences[]`，`nl` 不带句末标点）。

改完**必须**重新生成网页版数据，否则网页看不到新内容：

```bash
python3 tools/build_web_data.py
```

桌面版重启即生效；网页版提交 `web/data.js` 后由 Actions 自动重新部署。

## License

MIT