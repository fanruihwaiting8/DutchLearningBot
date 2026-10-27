# -*- coding: utf-8 -*-
"""Exam preparation dashboard (home page).

Lays out the 6 exam subjects plus the vocabulary / grammar cross-cutting
modules as cards, shows readiness per subject and suggests what to practise
next. Clicking a card opens the matching module.
"""

import tkinter as tk
from ui import theme as T

# Subject display metadata: route key -> (name, subtitle, assessment kind)
# kind: "rate" = scored by recent accuracy; "soon" = content lands in P2+
SUBJECT_CARDS = [
    ("woorden", "Vocabulary", "Theme-based memorising - 2000+ target", "rate"),
    ("lezen", "Reading Lezen", "B1 passage comprehension", "soon"),
    ("luisteren", "Listening Luisteren", "B1 audio comprehension", "soon"),
    ("schrijven", "Writing Schrijven", "Emails and forms", "soon"),
    ("spreken", "Speaking Spreken", "Situational responses", "soon"),
    ("knm", "Society KNM", "Dutch society and culture", "soon"),
    ("ona", "Labour market ONA", "Career-oriented results", "soon"),
    ("grammatica", "Grammar Grammatica", "Clauses / tenses / word order", "soon"),
]


def build(container, app):
    store = app.store
    ov = store.overview()

    root = tk.Frame(container, bg=T.BG)
    root.pack(fill="both", expand=True)

    # ---------- header ----------
    head = tk.Frame(root, bg=T.BG)
    head.pack(fill="x", padx=28, pady=(22, 6))
    T.make_label(head, "Dutch B1 Exam Dashboard", font=T.F_TITLE,
                 bg=T.BG).pack(anchor="w")
    T.make_label(
        head,
        "Inburgeringsexamen - reading / listening / writing / speaking + KNM + ONA",
        font=T.F_SMALL, fg=T.MUTED, bg=T.BG,
    ).pack(anchor="w", pady=(2, 0))

    # ---------- overall suggestion ----------
    tip = _suggestion(store, ov)
    tip_card = tk.Frame(root, bg="#eef3ff", highlightthickness=1,
                        highlightbackground="#c9d8ff")
    tip_card.pack(fill="x", padx=28, pady=(10, 4))
    T.make_label(tip_card, "Suggestion", font=T.F_SMALL, fg=T.PRIMARY,
                 bg="#eef3ff").pack(anchor="w", padx=14, pady=(8, 0))
    T.make_label(tip_card, tip, font=T.F_BODY, fg=T.TEXT, bg="#eef3ff",
                 wraplength=760, justify="left").pack(
        anchor="w", padx=14, pady=(0, 10))

    # ---------- subject card grid ----------
    grid = tk.Frame(root, bg=T.BG)
    grid.pack(fill="both", expand=True, padx=22, pady=10)
    cols = 2
    for i in range(cols):
        grid.columnconfigure(i, weight=1, uniform="col")

    for idx, (route, name, sub, kind) in enumerate(SUBJECT_CARDS):
        r, c = divmod(idx, cols)
        _card(grid, app, ov, route, name, sub, kind).grid(
            row=r, column=c, sticky="nsew", padx=6, pady=6)

    # ---------- footer stats ----------
    foot = tk.Frame(root, bg=T.BG)
    foot.pack(fill="x", padx=28, pady=(6, 18))
    T.make_label(
        foot,
        f"Words mastered {ov['mastered_count']} / {ov['total_words']}",
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

    # status line
    if kind == "rate":
        info = ov.get(route, {})
        rate = info.get("rate", 0.0)
        ready = info.get("ready", False)
        sampled = info.get("sampled", 0)
        color = T.rate_color(ready, sampled)
        if sampled == 0:
            status = "Not started - practise to set a baseline"
        else:
            tag = "On target" if ready else "In progress"
            status = f"Last {sampled} questions {rate*100:.0f}% correct - {tag}"
        T.make_label(inner, status, font=T.F_SMALL, fg=color,
                     bg=T.CARD).pack(anchor="w", pady=(0, 10))
        btn_text = "Start practice"
        btn_bg = T.PRIMARY
    else:
        T.make_label(inner, "In development (opens in a later phase)",
                     font=T.F_SMALL,
                     fg=T.MUTED, bg=T.CARD).pack(anchor="w", pady=(0, 10))
        btn_text = "View"
        btn_bg = T.MUTED

    T.make_button(inner, btn_text,
                  lambda r=route: app.navigate(r),
                  bg=btn_bg).pack(anchor="w")
    return card


def _suggestion(store, ov):
    """Suggest a next step based on current readiness (only vocabulary in P1)."""
    w = ov.get("woorden", {})
    if w.get("sampled", 0) == 0:
        return ("Start with the Vocabulary module: go through the flashcards by "
                "theme, then take the two-way choice and spelling quizzes to "
                "build a base for reading and listening. Target: 2000+ words.")
    if not w.get("ready", False):
        return ("Keep working on Vocabulary; getting recent accuracy above 80% "
                "counts as on target. Reading, listening and KNM modules will "
                "open after that.")
    return ("Vocabulary is on target, so the basics are solid. Later phases will "
            "open reading, listening, writing, speaking, KNM and ONA so you can "
            "clear the dashboard subject by subject.")