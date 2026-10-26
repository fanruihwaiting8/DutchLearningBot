# -*- coding: utf-8 -*-
"""把 data/ 下的学习素材打成 web/data.js(内嵌常量)。

为什么不在网页里直接 fetch JSON:
- 用 file:// 本地双击 index.html 打开时,fetch 会被浏览器 CORS 策略拦掉;
- 内嵌成 data.js 后,手机离线、本地直开、GitHub Pages 三种场景都能跑。

生成的全局变量:
    window.VOCAB     <- data/vocabulary.json  words[]
    window.LEZEN     <- data/lezen.json       passages[]
    window.ZINNEN    <- data/zinnen.json      sentences[]

素材更新后执行:
    python3 tools/build_web_data.py
"""

import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUT = os.path.join(BASE_DIR, "web", "data.js")

# (全局变量名, 文件名, JSON 顶层键, 中文说明)
SOURCES = [
    ("VOCAB", "vocabulary.json", "words", "单词"),
    ("LEZEN", "lezen.json", "passages", "阅读短文"),
    ("ZINNEN", "zinnen.json", "sentences", "句子"),
]


def load(filename, key):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = data.get(key, [])
    if not isinstance(items, list):
        raise ValueError("%s 里的 %s 不是数组" % (filename, key))
    return items


def main():
    parts = [
        "// 本文件由 tools/build_web_data.py 自动生成,请勿手改。\n",
        "// 改素材请编辑 data/*.json,然后重新执行该脚本。\n",
    ]
    summary = []
    for var, filename, key, label in SOURCES:
        items = load(filename, key)
        payload = json.dumps(items, ensure_ascii=False, indent=1)
        parts.append("window.%s = %s;\n" % (var, payload))
        summary.append("%s %d 条" % (label, len(items)))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("".join(parts))
    print("已生成 %s" % OUT)
    print("内容:" + "、".join(summary))


if __name__ == "__main__":
    main()