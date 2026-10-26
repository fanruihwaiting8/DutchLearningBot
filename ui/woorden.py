# -*- coding: utf-8 -*-
"""词汇模块(贯穿模块 A)。

三种练习模式:
- 闪卡:荷兰语 → 翻面看中文+例句,可朗读,可标记已掌握
- 双向选择:nl↔zh 随机方向,4 选 1,计入就绪度
- 拼写填空:看中文写荷兰语,计入就绪度

主题(cat)化:顶部下拉切换主题,只练该主题词。
所有选择/拼写作答通过 store.record_answer("woorden", ...) 计入看板。
"""

import random
import tkinter as tk
from ui import theme as T

SUBJECT = "woorden"
ALL_THEMES = "全部主题"


def build(container, app):
    WoordenPage(container, app)


class WoordenPage:
    def __init__(self, container, app):
        self.app = app
        self.store = app.store
        self.tts = app.tts

        self.theme_name = ALL_THEMES
        self.mode = "flash"          # flash / choice / spell
        self.pool = []
        self.idx = 0
        self.flipped = False
        self.answered = False        # 当前题是否已作答

        self.root = tk.Frame(container, bg=T.BG)
        self.root.pack(fill="both", expand=True)
        self._top_bar()
        self.body = tk.Frame(self.root, bg=T.BG)
        self.body.pack(fill="both", expand=True)
        self._reload_pool()

    # ---------- 顶部栏 ----------
    def _top_bar(self):
        bar = tk.Frame(self.root, bg=T.BG)
        bar.pack(fill="x", padx=20, pady=(16, 6))

        T.make_button(bar, "← 看板", lambda: self.app.navigate("dashboard"),
                      bg=T.MUTED).pack(side="left")

        T.make_label(bar, "主题", font=T.F_SMALL, fg=T.MUTED,
                     bg=T.BG).pack(side="left", padx=(16, 4))
        themes = [ALL_THEMES] + self.store.themes()
        self.theme_var = tk.StringVar(value=self.theme_name)
        om = tk.OptionMenu(bar, self.theme_var, *themes,
                           command=self._on_theme)
        om.config(bg=T.CARD, fg=T.TEXT, font=T.F_SMALL, relief="flat",
                  highlightthickness=1, cursor="hand2")
        om.pack(side="left")

        # 模式切换
        modes = [("flash", "闪卡"), ("choice", "选择"), ("spell", "拼写")]
        self.mode_btns = {}
        mframe = tk.Frame(bar, bg=T.BG)
        mframe.pack(side="right")
        for key, label in modes:
            b = T.make_button(mframe, label,
                              lambda k=key: self._on_mode(k),
                              bg=T.PRIMARY if key == self.mode else "#c7d2e8")
            b.pack(side="left", padx=3)
            self.mode_btns[key] = b

    def _refresh_mode_btns(self):
        for key, b in self.mode_btns.items():
            b.config(bg=T.PRIMARY if key == self.mode else "#c7d2e8")

    # ---------- 事件 ----------
    def _on_theme(self, value):
        self.theme_name = value
        self._reload_pool()

    def _on_mode(self, key):
        self.mode = key
        self._refresh_mode_btns()
        self.idx = 0
        self.flipped = False
        self.answered = False
        self._render()

    def _reload_pool(self):
        theme = None if self.theme_name == ALL_THEMES else self.theme_name
        self.pool = self.store.words_by_theme(theme)
        random.shuffle(self.pool)
        self.idx = 0
        self.flipped = False
        self.answered = False
        self._render()

    # ---------- 渲染分发 ----------
    def _clear_body(self):
        for w in self.body.winfo_children():
            w.destroy()

    def _render(self):
        self._clear_body()
        if not self.pool:
            T.make_label(self.body, "该主题暂无单词。", font=T.F_H2,
                         fg=T.MUTED, bg=T.BG).pack(pady=60)
            return
        if self.mode == "flash":
            self._render_flash()
        elif self.mode == "choice":
            self._render_choice()
        else:
            self._render_spell()

    def _progress_text(self):
        return f"{self.idx + 1} / {len(self.pool)}"

    # ---------- 闪卡 ----------
    def _render_flash(self):
        w = self.pool[self.idx]
        card = tk.Frame(self.body, bg=T.CARD, highlightthickness=1,
                        highlightbackground="#e3e8f0")
        card.pack(padx=40, pady=24, fill="both", expand=True)

        top = tk.Frame(card, bg=T.CARD)
        top.pack(fill="x", padx=18, pady=(14, 0))
        T.make_label(top, self._progress_text(), font=T.F_SMALL,
                     fg=T.MUTED, bg=T.CARD).pack(side="left")
        mastered = self.store.is_mastered(w["nl"])
        T.make_label(top, "★ 已掌握" if mastered else "",
                     font=T.F_SMALL, fg=T.OK, bg=T.CARD).pack(side="right")

        mid = tk.Frame(card, bg=T.CARD)
        mid.pack(fill="both", expand=True, pady=10)
        T.make_label(mid, w["nl"], font=T.F_BIG, bg=T.CARD).pack(pady=(20, 6))
        if self.tts.available:
            T.make_button(mid, "🔊 朗读",
                          lambda: self.tts.speak(w["nl"]),
                          bg="#5b7cf6", font=T.F_SMALL).pack()

        if self.flipped:
            T.make_label(mid, w["zh"], font=T.F_H2, fg=T.PRIMARY,
                         bg=T.CARD).pack(pady=(14, 4))
            if w.get("ex_nl"):
                T.make_label(mid, w["ex_nl"], font=T.F_BODY, bg=T.CARD,
                             wraplength=560).pack()
                T.make_label(mid, w.get("ex_zh", ""), font=T.F_SMALL,
                             fg=T.MUTED, bg=T.CARD,
                             wraplength=560).pack(pady=(2, 0))
                if self.tts.available:
                    T.make_button(mid, "🔊 朗读例句",
                                  lambda s=w["ex_nl"]: self.tts.speak(s),
                                  bg="#5b7cf6", font=T.F_SMALL).pack(pady=(8, 0))

        # 操作区
        ops = tk.Frame(card, bg=T.CARD)
        ops.pack(fill="x", padx=18, pady=16)
        T.make_button(ops, "上一张", self._prev, bg="#c7d2e8").pack(side="left")
        T.make_button(ops, "翻面" if not self.flipped else "收起",
                      self._flip).pack(side="left", padx=8)
        T.make_button(ops, "取消掌握" if mastered else "标记已掌握",
                      lambda: self._toggle_mastered(w),
                      bg=T.BAD if mastered else T.OK).pack(side="left")
        T.make_button(ops, "下一张", self._next,
                      bg=T.PRIMARY).pack(side="right")

    def _flip(self):
        self.flipped = not self.flipped
        self._render()

    def _toggle_mastered(self, w):
        self.store.toggle_mastered(w["nl"])
        self._render()

    def _prev(self):
        self.idx = (self.idx - 1) % len(self.pool)
        self.flipped = False
        self._render()

    def _next(self):
        self.idx = (self.idx + 1) % len(self.pool)
        self.flipped = False
        self._render()

    # ---------- 双向选择 ----------
    def _render_choice(self):
        w = self.pool[self.idx]
        # 方向:True=nl→zh(看荷兰语选中文),False=zh→nl
        # _render_choice 只在出新题时调用(作答后走 _draw_choice)
        self._dir = random.random() < 0.5
        self._build_choice_question(w, self._dir)
        self._draw_choice(w, self._dir)

    def _build_choice_question(self, w, direction):
        key = "zh" if direction else "nl"
        correct = w[key]
        others = [x[key] for x in self.store.words if x[key] != correct]
        random.shuffle(others)
        opts = others[:3] + [correct]
        random.shuffle(opts)
        self._opts = opts
        self._correct = correct
        self._picked = None

    def _draw_choice(self, w, direction):
        self._clear_body()
        wrap = tk.Frame(self.body, bg=T.BG)
        wrap.pack(fill="both", expand=True, padx=40, pady=24)

        T.make_label(wrap, self._progress_text(), font=T.F_SMALL,
                     fg=T.MUTED, bg=T.BG).pack(anchor="w")
        prompt = w["nl"] if direction else w["zh"]
        ask = "选择对应的中文" if direction else "选择对应的荷兰语"
        T.make_label(wrap, ask, font=T.F_SMALL, fg=T.MUTED,
                     bg=T.BG).pack(pady=(14, 2))
        T.make_label(wrap, prompt, font=T.F_BIG, bg=T.BG).pack(pady=(0, 6))
        if direction and self.tts.available:
            T.make_button(wrap, "🔊 朗读", lambda: self.tts.speak(w["nl"]),
                          bg="#5b7cf6", font=T.F_SMALL).pack(pady=(0, 8))

        for opt in self._opts:
            bg = T.CARD
            fg = T.TEXT
            if self.answered:
                if opt == self._correct:
                    bg, fg = T.OK, "#fff"
                elif opt == self._picked:
                    bg, fg = T.BAD, "#fff"
            b = T.make_button(wrap, opt,
                              lambda o=opt: self._pick_choice(o, w, direction),
                              bg=bg, fg=fg)
            b.config(width=26)
            b.pack(pady=4)

        if self.answered:
            if w.get("ex_nl"):
                T.make_label(wrap, w["ex_nl"], font=T.F_BODY, bg=T.BG,
                             wraplength=560).pack(pady=(10, 0))
            T.make_button(wrap, "下一题", self._next_qa,
                          bg=T.PRIMARY).pack(pady=12)

    def _pick_choice(self, opt, w, direction):
        if self.answered:
            return
        self.answered = True
        self._picked = opt
        self.store.record_answer(SUBJECT, opt == self._correct)
        self._draw_choice(w, direction)

    # ---------- 拼写填空 ----------
    def _render_spell(self):
        w = self.pool[self.idx]
        wrap = tk.Frame(self.body, bg=T.BG)
        wrap.pack(fill="both", expand=True, padx=40, pady=24)

        T.make_label(wrap, self._progress_text(), font=T.F_SMALL,
                     fg=T.MUTED, bg=T.BG).pack(anchor="w")
        T.make_label(wrap, "根据中文写出荷兰语", font=T.F_SMALL,
                     fg=T.MUTED, bg=T.BG).pack(pady=(14, 2))
        T.make_label(wrap, w["zh"], font=T.F_BIG, fg=T.PRIMARY,
                     bg=T.BG).pack(pady=(0, 10))

        self.spell_var = tk.StringVar()
        entry = tk.Entry(wrap, textvariable=self.spell_var, font=T.F_H2,
                         justify="center", width=22)
        entry.pack(pady=6)
        entry.focus_set()
        entry.bind("<Return>", lambda e: self._check_spell(w))

        self.spell_result = T.make_label(wrap, "", font=T.F_BODY, bg=T.BG)
        self.spell_result.pack(pady=8)

        row = tk.Frame(wrap, bg=T.BG)
        row.pack(pady=6)
        T.make_button(row, "提交", lambda: self._check_spell(w)).pack(side="left")
        T.make_button(row, "跳过 / 下一题", self._next_qa,
                      bg=T.MUTED).pack(side="left", padx=8)

    def _check_spell(self, w):
        if self.answered:
            return
        ans = self.spell_var.get().strip().lower()
        ok = ans == w["nl"].strip().lower()
        self.answered = True
        self.store.record_answer(SUBJECT, ok)
        if ok:
            self.spell_result.config(text="✓ 正确!", fg=T.OK)
        else:
            self.spell_result.config(text=f"✗ 正确答案:{w['nl']}", fg=T.BAD)
        if self.tts.available:
            self.tts.speak(w["nl"])

    # ---------- 选择/拼写共用:下一题 ----------
    def _next_qa(self):
        self.idx = (self.idx + 1) % len(self.pool)
        self.answered = False
        self._render()