# -*- coding: utf-8 -*-
"""Dutch text-to-speech wrapper (built on the macOS "say" command).

- Prefers Dutch voices (Xander/Claire/Ellen) and auto-detects what is installed
- Non-blocking: every utterance runs in its own thread so the Tkinter main
  loop never freezes
- On non-macOS systems, or without a Dutch voice, available=False so callers
  can disable their buttons
"""

import sys
import shutil
import threading
import subprocess

# Common macOS Dutch voices, in order of preference
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
        # First look for a known Dutch voice, by preference
        for v in NL_VOICES:
            for line in out.splitlines():
                if line.strip().startswith(v):
                    self.voice = v
                    self.available = True
                    return
        # Fallback: any voice with an nl_ locale
        for line in out.splitlines():
            if "nl_" in line:
                self.voice = line.split()[0]
                self.available = True
                return

    def speak(self, text):
        """Speak a Dutch text asynchronously; returns False silently when unavailable."""
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


# Process-wide singleton, shared by all UI modules
_instance = None


def get_tts():
    global _instance
    if _instance is None:
        _instance = TTS()
    return _instance