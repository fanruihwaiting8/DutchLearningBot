# -*- coding: utf-8 -*-
"""备考看板首页。

把 6 科目 + 词汇/语法贯穿模块以卡片形式铺开,显示各科就绪度,
并给出「下一步练什么」的建议。点击卡片进入对应模块。
"""

import tkinter as tk
from ui import theme as T

# 科目展示元数据:route 键 -> (中文名, 副标题, 评估类型)
# kind: "rate"=按最近正确率评估;"soon"=P2+ 才开放内容
SUBJECT_CARDS = [
    ("woorden", "词汇", "主题化记忆 · 2000+ 目标", "rate"),
    ("lezen", "阅读 Lezen", "B1 短文理解", "soon"),
    ("luisteren", "听力 Luisteren", "B1 语音听辨", "soon"),
    ("schrijven", "写作 Schrijven", "邮件/表单书写", "soon"),
    ("spreken", "口语 Spreken", "情景对话应答", "soon"),
    ("knm", "社会知识 KNM", "荷兰社会与文化", "soon"),
    ("ona", "劳动市场 ONA", "职业导向成果", "soon"),
    ("grammatica", "语法 Grammatica", "从句/时态/语序", "soon"),
]


def build(container, app):
    store = app.store
    ov = store.overview()

    root = tk.Frame(container, bg=T.BG)
    root.pack(fill="both", expand=True)

    # ---------- 顶部标题 ----------
    head = tk.Frame(root, bg=T.BG)
    head.pack(fill="x", padx=28, pady=(22, 6))
    T.make_label(head, "荷兰语 B1 备考看板", font=T.F_TITLE, bg=T.BG).pack(anchor="w")
    T.make_label(
        head, "Inburgeringsexamen · 读 / 听 / 写 / 说 + KNM + ONA",
        font=T.F_SMALL, fg=T.MUTED, bg=T.BG,
    ).pack(anchor="w", pady=(2, 0))

    # ---------- 总体建议 ----------
    tip = _suggestion(store, ov)
    tip_card = tk.Frame(root, bg="#eef3ff", highlightthickness=1,
                        highlightbackground="#c9d8ff")
    tip_card.pack(fill="x", padx=28, pady=(10, 4))
    T.make_label(tip_card, "建议", font=T.F_SMALL, fg=T.PRIMARY,
                 bg="#eef3ff").pack(anchor="w", padx=14, pady=(8, 0))
    T.make_label(tip_card, tip, font=T.F_BODY, fg=T.TEXT, bg="#eef3ff",
                 wraplength=760, justify="left").pack(
        anchor="w", padx=14, pady=(0, 10))

    # ---------- 科目卡片网格 ----------
    grid = tk.Frame(root, bg=T.BG)
    grid.pack(fill="both", expand=True, padx=22, pady=10)
    cols = 2
    for i in range(cols):
        grid.columnconfigure(i, weight=1, uniform="col")

    for idx, (route, name, sub, kind) in enumerate(SUBJECT_CARDS):
        r, c = divmod(idx, cols)
        _card(grid, app, ov, route, name, sub, kind).grid(
            row=r, column=c, sticky="nsew", padx=6, pady=6)

    # ---------- 底部统计 ----------
    foot = tk.Frame(root, bg=T.BG)
    foot.pack(fill="x", padx=28, pady=(6, 18))
    T.make_label(
        foot,
        f"已掌握单词 {ov['mastered_count']} / {ov['total_words']}",
        font=T.F_SMALL, fg=T.MUTED, bg=T.BG,
    ).pack(anchor="w")


def _card(parent, app, ov, route, name, sub, kind):
    card = tk.Frame(parent, bg=T.CARD, highlightthickness=1,
                    highlightbackground="#e3e8f0")
    inner = tk.Frame(card, bg=T.CARD)
    inner.pack(fill="both", expand=True, padx=16, pady=14)

    T.make_label(inner, name, font=T.F_H2, bg=T.CARD).pack(anchor="w")
    T.make_label(inner, sub, font=T.F_SMALL, fg=T.MUTED,
                 bg=T.CARD).pack(anchor="w", pady=(1, 8))

    # 状态行
    if kind == "rate":
        info = ov.get(route, {})
        rate = info.get("rate", 0.0)
        ready = info.get("ready", False)
        sampled = info.get("sampled", 0)
        color = T.rate_color(ready, sampled)
        if sampled == 0:
            status = "未开始 · 去练习建立基线"
        else:
            tag = "已达标" if ready else "练习中"
            status = f"最近 {sampled} 题正确率 {rate*100:.0f}% · {tag}"
        T.make_label(inner, status, font=T.F_SMALL, fg=color,
                     bg=T.CARD).pack(anchor="w", pady=(0, 10))
        btn_text = "进入练习"
        btn_bg = T.PRIMARY
    else:
        T.make_label(inner, "内容开发中(后续阶段开放)", font=T.F_SMALL,
                     fg=T.MUTED, bg=T.CARD).pack(anchor="w", pady=(0, 10))
        btn_text = "查看"
        btn_bg = T.MUTED

    T.make_button(inner, btn_text,
                  lambda r=route: app.navigate(r),
                  bg=btn_bg).pack(anchor="w")
    return card


def _suggestion(store, ov):
    """基于当前就绪度给出下一步建议(P1 仅词汇有内容)。"""
    w = ov.get("woorden", {})
    if w.get("sampled", 0) == 0:
        return ("先从「词汇」模块开始:按主题过一遍闪卡,再做双向选择和拼写测验,"
                "为后续阅读/听力打底。目标词汇量 2000+。")
    if not w.get("ready", False):
        return ("继续巩固「词汇」,把最近正确率提到 80% 以上即算达标;"
                "之后阅读、听力、KNM 模块会陆续开放。")
    return ("词汇已达标,基础扎实。后续阶段将开放阅读、听力、写作、口语、"
            "KNM 与 ONA 模块,可按看板逐科攻克。")