# -*- coding: utf-8 -*-
"""Shared look and feel: colours, fonts and common widget factories.

Every UI module takes its constants and factory functions from here so the
whole app keeps one consistent style.
"""

import tkinter as tk

# ---------- colours ----------
BG = "#f4f6fb"          # page background
CARD = "#ffffff"        # card background
PRIMARY = "#3b6cf6"     # primary colour (Dutch blue)
PRIMARY_DK = "#2a54cc"  # primary pressed state
OK = "#2fa36b"          # ready / correct
WARN = "#e0932f"        # in progress
BAD = "#d1495b"         # not ready / wrong
TEXT = "#1f2733"        # main text
MUTED = "#7a8699"       # secondary text
ORANGE = "#ff6a1a"      # Dutch orange accent

# ---------- fonts ----------
FONT = "Helvetica Neue"
F_TITLE = (FONT, 22, "bold")
F_H2 = (FONT, 16, "bold")
F_BODY = (FONT, 13)
F_SMALL = (FONT, 11)
F_BIG = (FONT, 30, "bold")


class HoverButton(tk.Label):
    """A button simulated with a Label.

    On macOS the native tk.Button ignores bg under the Aqua theme and always
    renders as a grey system button, which looks disabled. Using a Label plus
    event bindings gives a real solid-colour button: visible by default,
    darker on hover, running command on click.
    """

    def __init__(self, parent, command=None, **kw):
        self._command = command
        kw.setdefault("padx", 16)
        kw.setdefault("pady", 8)
        super().__init__(parent, **kw)
        self._base_bg = self.cget("bg")
        self.config(cursor="hand2")
        self.bind("<Enter>", self._on_enter)
        self.bind("<Leave>", self._on_leave)
        self.bind("<Button-1>", self._on_click)

    def _on_enter(self, _e):
        tk.Label.configure(self, bg=_darken(self._base_bg))

    def _on_leave(self, _e):
        tk.Label.configure(self, bg=self._base_bg)

    def _on_click(self, _e):
        if self._command:
            self._command()

    def configure(self, **kw):
        # Keep the base colour in sync when bg is changed from outside,
        # so leaving the hover state restores the right colour.
        if "bg" in kw:
            self._base_bg = kw["bg"]
        if "background" in kw:
            self._base_bg = kw["background"]
        return super().configure(**kw)

    config = configure


def make_button(parent, text, command, bg=PRIMARY, fg="#ffffff",
                font=F_BODY, width=None, height=None):
    """Solid-colour button (per project rule: visible by default, never hover-only)."""
    btn = HoverButton(
        parent, command=command, text=text,
        bg=bg, fg=fg, font=font,
        bd=0, relief="flat",
    )
    if width:
        btn.config(width=width)
    if height:
        btn.config(height=height)
    return btn


def make_card(parent, **kw):
    """Shared card container (a Frame with padding, faking rounded corners)."""
    f = tk.Frame(parent, bg=CARD, bd=0, highlightthickness=1,
                 highlightbackground="#e3e8f0")
    return f


def make_label(parent, text, font=F_BODY, fg=TEXT, bg=None, **kw):
    return tk.Label(parent, text=text, font=font, fg=fg,
                    bg=bg or parent.cget("bg"), **kw)


def _darken(hex_color, factor=0.85):
    """Darken a colour, used for the pressed state."""
    try:
        c = hex_color.lstrip("#")
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        r, g, b = int(r * factor), int(g * factor), int(b * factor)
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        return hex_color


def rate_color(ready, sampled):
    """Status colour: green when ready, orange with samples, grey without."""
    if ready:
        return OK
    if sampled > 0:
        return WARN
    return MUTED