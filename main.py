# -*- coding: utf-8 -*-
"""荷兰语 B1 备考助手 —— 应用入口与路由。

架构:
- core/  数据与进度存储(store)、语音(tts)
- ui/    备考看板(dashboard)、词汇(woorden)、各科占位页(placeholder)

main.py 仅负责:创建主窗口、持有全局 store/tts、按 route 切换页面。
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

# 占位页路由(P2+ 才落地内容)
PLACEHOLDER_ROUTES = {
    "lezen", "luisteren", "schrijven", "spreken", "knm", "ona", "grammatica",
}


class DutchApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("荷兰语 B1 备考助手")
        self.geometry("880x640")
        self.minsize(760, 560)
        self.configure(bg=T.BG)

        self.store = Store()
        self.tts = get_tts()

        # 页面容器
        self.container = tk.Frame(self, bg=T.BG)
        self.container.pack(fill="both", expand=True)

        self.navigate("dashboard")

    def navigate(self, route):
        """清空容器并渲染目标页面。"""
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
            messagebox.showerror("出错了", traceback.format_exc())


def main():
    try:
        app = DutchApp()
        app.mainloop()
    except Exception:
        traceback.print_exc()
        try:
            messagebox.showerror("启动失败", traceback.format_exc())
        except Exception:
            pass


if __name__ == "__main__":
    main()