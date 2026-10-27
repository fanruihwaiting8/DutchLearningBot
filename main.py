# -*- coding: utf-8 -*-
"""Dutch B1 Exam Trainer - application entry point and routing.

Architecture:
- core/  data and progress storage (store), speech (tts)
- ui/    exam dashboard, vocabulary (woorden), per-subject placeholders

main.py only creates the main window, owns the global store/tts and
switches pages by route.
"""

import sys
import os
import traceback
import tkinter as tk
from tkinter import messagebox

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.store import Store
from core.tts import get_tts
from ui import theme as T
from ui import dashboard, woorden, placeholder

# Placeholder routes (real content lands in P2+)
PLACEHOLDER_ROUTES = {
    "lezen", "luisteren", "schrijven", "spreken", "knm", "ona", "grammatica",
}


class DutchApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Dutch B1 Exam Trainer")
        self.geometry("880x640")
        self.minsize(760, 560)
        self.configure(bg=T.BG)

        self.store = Store()
        self.tts = get_tts()

        # Page container
        self.container = tk.Frame(self, bg=T.BG)
        self.container.pack(fill="both", expand=True)

        self.navigate("dashboard")

    def navigate(self, route):
        """Clear the container and render the target page."""
        for w in self.container.winfo_children():
            w.destroy()
        try:
            if route == "dashboard":
                dashboard.build(self.container, self)
            elif route == "woorden":
                woorden.build(self.container, self)
            elif route in PLACEHOLDER_ROUTES:
                placeholder.build(self.container, self, route)
            else:
                dashboard.build(self.container, self)
        except Exception:
            traceback.print_exc()
            messagebox.showerror("Something went wrong", traceback.format_exc())


def main():
    try:
        app = DutchApp()
        app.mainloop()
    except Exception:
        traceback.print_exc()
        try:
            messagebox.showerror("Failed to start", traceback.format_exc())
        except Exception:
            pass


if __name__ == "__main__":
    main()