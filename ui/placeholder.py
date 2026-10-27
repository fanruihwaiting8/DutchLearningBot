# -*- coding: utf-8 -*-
"""Generic "coming soon" placeholder page.

Reading / listening / writing / speaking / KNM / ONA / grammar land in P2+,
so they share this page, which lists the planned scope of each module.
"""

import tkinter as tk
from ui import theme as T

# route -> (title, planned highlights)
PLANS = {
    "lezen": ("Reading Lezen", [
        "B1 passages + multiple-choice comprehension",
        "Real-world texts: emails, notices, instructions",
        "Answers count towards dashboard readiness (last 20 >= 80%)",
    ]),
    "luisteren": ("Listening Luisteren", [
        "Dutch TTS reads prompts and dialogues",
        "Listen-then-choose / fill in the blank",
        "Replay and speed control supported",
    ]),
    "schrijven": ("Writing Schrijven", [
        "Emails, messages and form-filling tasks",
        "Model answers + self-check point list",
        "Library of common patterns and connectors",
    ]),
    "spreken": ("Speaking Spreken", [
        "Situational Q&A and picture descriptions",
        "TTS model pronunciation + repeat after me",
        "Prompt cards with key expressions",
    ]),
    "knm": ("Society KNM", [
        "Dutch history, geography, politics, law",
        "Work, housing, healthcare and education systems",
        "Situational judgement questions, count towards readiness",
    ]),
    "ona": ("Labour market ONA", [
        "The 8 career-oriented results (resultaten)",
        "CV, cover letter and interview preparation",
        "Tick off the result checklist one by one",
    ]),
    "grammatica": ("Grammar Grammatica", [
        "Subordinate word order, perfect tense, modal verbs",
        "Separable verbs, conjunctions, comparatives",
        "Relative clauses and the 'er' constructions",
    ]),
}


def build(container, app, route):
    title, points = PLANS.get(route, ("Module", ["Content being planned"]))

    root = tk.Frame(container, bg=T.BG)
    root.pack(fill="both", expand=True)

    bar = tk.Frame(root, bg=T.BG)
    bar.pack(fill="x", padx=20, pady=(16, 6))
    T.make_button(bar, "< Dashboard", lambda: app.navigate("dashboard"),
                  bg=T.MUTED).pack(side="left")

    card = tk.Frame(root, bg=T.CARD, highlightthickness=1,
                    highlightbackground="#e3e8f0")
    card.pack(padx=40, pady=30, fill="both", expand=True)
    T.make_label(card, title, font=T.F_TITLE, bg=T.CARD).pack(
        anchor="w", padx=24, pady=(24, 4))
    T.make_label(card, "This module is in development. Planned scope:",
                 font=T.F_BODY,
                 fg=T.MUTED, bg=T.CARD).pack(anchor="w", padx=24, pady=(0, 14))
    for p in points:
        T.make_label(card, "-  " + p, font=T.F_BODY, bg=T.CARD).pack(
            anchor="w", padx=36, pady=3)