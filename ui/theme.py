# -*- coding: utf-8 -*-
"""统一视觉:配色、字体、通用控件工厂。

各 UI 模块从这里取常量与工厂函数,保证风格一致。
"""

import tkinter as tk

# ---------- 配色 ----------
BG = "#f4f6fb"          # 页面背景
CARD = "#ffffff"        # 卡片背景
PRIMARY = "#3b6cf6"     # 主色(荷兰蓝)
PRIMARY_DK = "#2a54cc"  # 主色按下态
OK = "#2fa36b"          # 达标/正确
WARN = "#e0932f"        # 进行中
BAD = "#d1495b"         # 未达标/错误
TEXT = "#1f2733"        # 主文字
MUTED = "#7a8699"       # 次要文字
ORANGE = "#ff6a1a"      # 荷兰橙点缀

# ---------- 字体 ----------
FONT = "PingFang SC"    # macOS 中文字体
F_TITLE = (FONT, 22, "bold")
F_H2 = (FONT, 16, "bold")
F_BODY = (FONT, 13)
F_SMALL = (FONT, 11)
F_BIG = (FONT, 30, "bold")


class HoverButton(tk.Label):
    """用 Label 模拟的按钮。

    macOS 原生 tk.Button 在 Aqua 主题下忽略 bg,一律显示为系统灰按钮,
    看起来像禁用。这里用 Label + 事件绑定实现真正的实底色按钮:
    常态即可见、悬停变暗、点击触发 command。
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
        # 外部改 bg 时同步基准色,保证悬停恢复正确
        if "bg" in kw:
            self._base_bg = kw["bg"]
        if "background" in kw:
            self._base_bg = kw["background"]
        return super().configure(**kw)

    config = configure


def make_button(parent, text, command, bg=PRIMARY, fg="#ffffff",
                font=F_BODY, width=None, height=None):
    """实底色按钮(遵循项目按钮规范:常态即可见,不靠悬停才显色)。"""
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
    """统一圆角感卡片容器(用 Frame + 内边距模拟)。"""
    f = tk.Frame(parent, bg=CARD, bd=0, highlightthickness=1,
                 highlightbackground="#e3e8f0")
    return f


def make_label(parent, text, font=F_BODY, fg=TEXT, bg=None, **kw):
    return tk.Label(parent, text=text, font=font, fg=fg,
                    bg=bg or parent.cget("bg"), **kw)


def _darken(hex_color, factor=0.85):
    """把颜色调暗,用作按下态。"""
    try:
        c = hex_color.lstrip("#")
        r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
        r, g, b = int(r * factor), int(g * factor), int(b * factor)
        return f"#{r:02x}{g:02x}{b:02x}"
    except Exception:
        return hex_color


def rate_color(ready, sampled):
    """根据就绪状态返回状态色:达标绿 / 有样本橙 / 无样本灰。"""
    if ready:
        return OK
    if sampled > 0:
        return WARN
    return MUTED