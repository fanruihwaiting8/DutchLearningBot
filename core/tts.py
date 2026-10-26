# -*- coding: utf-8 -*-
"""荷兰语语音朗读封装(基于 macOS 内置 say)。

- 优先使用荷兰语语音(Xander/Claire/Ellen),自动探测可用者
- 非阻塞:每次朗读在独立线程,避免卡住 Tkinter 主循环
- 非 macOS 或无荷兰语语音时 available=False,调用方可据此禁用按钮
"""

import sys
import shutil
import threading
import subprocess

# 常见 macOS 荷兰语语音,按优先级排列
NL_VOICES = ["Xander", "Claire", "Ellen"]


class TTS:
    def __init__(self):
        self.voice = None
        self.available = False
        self._detect()

    def _detect(self):
        if sys.platform != "darwin":
            return
        if shutil.which("say") is None:
            return
        try:
            out = subprocess.run(
                ["say", "-v", "?"],
                capture_output=True, text=True, timeout=5,
            ).stdout
        except Exception:
            return
        # 先按优先级找已知荷兰语语音
        for v in NL_VOICES:
            for line in out.splitlines():
                if line.strip().startswith(v):
                    self.voice = v
                    self.available = True
                    return
        # 退而求其次:任何 nl_ 语言的语音
        for line in out.splitlines():
            if "nl_" in line:
                self.voice = line.split()[0]
                self.available = True
                return

    def speak(self, text):
        """异步朗读一段荷兰语文本;不可用时静默返回 False。"""
        if not self.available or not text:
            return False
        threading.Thread(
            target=self._run, args=(text,), daemon=True
        ).start()
        return True

    def _run(self, text):
        try:
            subprocess.run(
                ["say", "-v", self.voice, text],
                capture_output=True, timeout=30,
            )
        except Exception:
            pass


# 进程内单例,供各 UI 模块复用
_instance = None


def get_tts():
    global _instance
    if _instance is None:
        _instance = TTS()
    return _instance