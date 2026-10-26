# -*- coding: utf-8 -*-
"""通用「开发中」占位页。

阅读/听力/写作/口语/KNM/ONA/语法等 P2+ 才落地的模块共用此页,
展示该模块的规划要点,让用户对后续内容有预期。
"""

import tkinter as tk
from ui import theme as T

# route -> (标题, 规划要点列表)
PLANS = {
    "lezen": ("阅读 Lezen", [
        "B1 短文 + 多选理解题",
        "邮件、通知、说明书等真实语料",
        "答题计入看板就绪度(最近20题≥80%)",
    ]),
    "luisteren": ("听力 Luisteren", [
        "荷兰语 TTS 朗读题干与对话",
        "听后选择 / 填空",
        "支持重复播放与语速控制",
    ]),
    "schrijven": ("写作 Schrijven", [
        "邮件、留言、表单填写任务",
        "范文对照 + 要点自评清单",
    "常用句型与连接词库",
    ]),
    "spreken": ("口语 Spreken", [
        "情景问答与看图说话",
        "TTS 示范发音 + 跟读",
        "关键表达提示卡",
    ]),
    "knm": ("社会知识 KNM", [
        "荷兰历史、地理、政治、法律",
        "工作、住房、医疗、教育制度",
        "情景判断题,计入就绪度",
    ]),
    "ona": ("劳动市场 ONA", [
        "8 项职业导向成果(resultaten)",
        "简历、求职信、面试准备",
        "成果清单逐项打勾完成",
    ]),
    "grammatica": ("语法 Grammatica", [
        "从句语序、完成时、情态动词",
        "可分动词、连词、比较级",
        "关系从句与 er 结构专项",
    ]),
}


def build(container, app, route):
    title, points = PLANS.get(route, ("模块", ["内容规划中"]))

    root = tk.Frame(container, bg=T.BG)
    root.pack(fill="both", expand=True)

    bar = tk.Frame(root, bg=T.BG)
    bar.pack(fill="x", padx=20, pady=(16, 6))
    T.make_button(bar, "← 看板", lambda: app.navigate("dashboard"),
                  bg=T.MUTED).pack(side="left")

    card = tk.Frame(root, bg=T.CARD, highlightthickness=1,
                    highlightbackground="#e3e8f0")
    card.pack(padx=40, pady=30, fill="both", expand=True)
    T.make_label(card, title, font=T.F_TITLE, bg=T.CARD).pack(
        anchor="w", padx=24, pady=(24, 4))
    T.make_label(card, "该模块内容开发中,规划要点:", font=T.F_BODY,
                 fg=T.MUTED, bg=T.CARD).pack(anchor="w", padx=24, pady=(0, 14))
    for p in points:
        T.make_label(card, "•  " + p, font=T.F_BODY, bg=T.CARD).pack(
            anchor="w", padx=36, pady=3)