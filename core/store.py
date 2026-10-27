# -*- coding: utf-8 -*-
"""Data and progress storage layer.

Responsibilities:
- load the vocabulary (vocabulary.json) and the optional per-subject banks
  (an empty list is returned when a bank is missing)
- theme-based access to the vocabulary (grouped by cat)
- persist per-subject progress and readiness
- automatically migrate the legacy progress.json structure
"""

import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
VOCAB_FILE = os.path.join(DATA_DIR, "vocabulary.json")
PROGRESS_FILE = os.path.join(DATA_DIR, "progress.json")

# Internal keys of the six exam subjects + the cross-cutting modules
SUBJECTS = ["lezen", "luisteren", "schrijven", "spreken", "knm", "ona"]
# Subjects whose readiness is based on the accuracy of the last N questions
RATE_SUBJECTS = ["lezen", "luisteren", "knm", "woorden"]
RECENT_WINDOW = 20          # readiness sampling window
READY_THRESHOLD = 0.80      # accuracy needed to be considered ready


def _empty_progress():
    """Return a brand new progress structure."""
    subjects = {}
    for s in RATE_SUBJECTS:
        subjects[s] = {"answered": 0, "correct": 0, "recent": []}
    return {
        "version": 2,
        "mastered": [],          # list of mastered words (nl)
        "subjects": subjects,    # per-subject answer statistics
        "tasks": {},             # completion records for writing/speaking/ONA tasks
    }


def _migrate(old):
    """Migrate the legacy {mastered, answered, correct} shape to v2."""
    new = _empty_progress()
    if isinstance(old.get("mastered"), list):
        new["mastered"] = old["mastered"]
    # Legacy answer statistics are treated as vocabulary results
    ans = int(old.get("answered", 0) or 0)
    cor = int(old.get("correct", 0) or 0)
    if ans:
        new["subjects"]["woorden"]["answered"] = ans
        new["subjects"]["woorden"]["correct"] = cor
    return new


class Store:
    """Single entry point for vocabulary, question banks and progress."""

    def __init__(self):
        self.words = self._load_words()
        self.progress = self._load_progress()

    # ---------- vocabulary ----------
    def _load_words(self):
        try:
            with open(VOCAB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("words", [])
        except Exception:
            return []

    def themes(self):
        """Return the de-duplicated, sorted list of themes (cat)."""
        seen = []
        for w in self.words:
            c = w.get("cat", "")
            if c and c not in seen:
                seen.append(c)
        return sorted(seen)

    def words_by_theme(self, theme=None):
        """Filter words by theme; None/empty returns everything."""
        if not theme:
            return list(self.words)
        return [w for w in self.words if w.get("cat") == theme]

    # ---------- question banks (per subject, optional) ----------
    def load_bank(self, subject):
        """Load the items of data/<subject>.json, [] when missing."""
        path = os.path.join(DATA_DIR, f"{subject}.json")
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("items", [])
        except Exception:
            return []

    # ---------- load/save progress ----------
    def _load_progress(self):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return _empty_progress()
        # Version check and migration
        if data.get("version") != 2 or "subjects" not in data:
            data = _migrate(data)
            self._save(data)
            return data
        # Fill in subject keys that may be missing
        base = _empty_progress()
        for k in base["subjects"]:
            data["subjects"].setdefault(k, base["subjects"][k])
        data.setdefault("mastered", [])
        data.setdefault("tasks", {})
        return data

    def _save(self, data):
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print("Failed to save progress:", e)

    def save(self):
        self._save(self.progress)

    # ---------- answer records and readiness ----------
    def record_answer(self, subject, correct):
        """Record one answer result and write it to disk immediately."""
        subs = self.progress["subjects"]
        if subject not in subs:
            subs[subject] = {"answered": 0, "correct": 0, "recent": []}
        s = subs[subject]
        s["answered"] = s.get("answered", 0) + 1
        if correct:
            s["correct"] = s.get("correct", 0) + 1
        recent = s.setdefault("recent", [])
        recent.append(1 if correct else 0)
        # Keep only the records inside the window
        if len(recent) > RECENT_WINDOW:
            del recent[:-RECENT_WINDOW]
        self.save()

    def readiness(self, subject):
        """Return (rate, ready, sampled): recent accuracy, ready flag, sample size."""
        s = self.progress["subjects"].get(subject)
        if not s or not s.get("recent"):
            return 0.0, False, 0
        recent = s["recent"]
        sampled = len(recent)
        rate = sum(recent) / sampled
        ready = sampled >= RECENT_WINDOW and rate >= READY_THRESHOLD
        return rate, ready, sampled

    def task_done(self, key):
        return bool(self.progress.get("tasks", {}).get(key))

    def set_task(self, key, done=True):
        self.progress.setdefault("tasks", {})[key] = bool(done)
        self.save()

    # ---------- mastered words ----------
    def is_mastered(self, nl):
        return nl in self.progress.get("mastered", [])

    def toggle_mastered(self, nl):
        m = self.progress.setdefault("mastered", [])
        if nl in m:
            m.remove(nl)
        else:
            m.append(nl)
        self.save()
        return nl in m

    # ---------- overview ----------
    def overview(self):
        """Used by the dashboard: readiness summary per subject."""
        result = {}
        for s in RATE_SUBJECTS:
            rate, ready, sampled = self.readiness(s)
            result[s] = {"rate": rate, "ready": ready, "sampled": sampled}
        result["mastered_count"] = len(self.progress.get("mastered", []))
        result["total_words"] = len(self.words)
        return result