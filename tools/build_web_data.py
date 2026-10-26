# -*- coding: utf-8 -*-
"""把 data/vocabulary.json 打成 web/data.js(内嵌常量)。

为什么不在网页里直接 fetch JSON:
- 用 file:// 本地双击 index.html 打开时,fetch 会被浏览器 CORS 策略拦掉;
- 内嵌成 data.js 后,手机离线、本地直开、GitHub Pages 三种场景都能跑。

词库更新后执行:
    python3 tools/build_web_data.py
"""

import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOCAB = os.path.join(BASE_DIR, "data", "vocabulary.json")
OUT = os.path.join(BASE_DIR, "web", "data.js")


def main():
    with open(VOCAB, "r", encoding="utf-8") as f:
        data = json.load(f)
    words = data.get("words", [])

    payload = json.dumps(words, ensure_ascii=False, indent=1)
    content = (
        "// 本文件由 tools/build_web_data.py 从 data/vocabulary.json 自动生成,请勿手改。\n"
        "// 改词库请编辑 data/vocabulary.json,然后重新执行该脚本。\n"
        "window.VOCAB = %s;\n" % payload
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(content)
    print("已生成 %s,共 %d 个单词" % (OUT, len(words)))


if __name__ == "__main__":
    main()