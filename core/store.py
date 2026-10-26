# -*- coding: utf-8 -*-
"""数据与进度存储层。

职责:
- 加载词库(vocabulary.json)与各科题库(可选,缺失则返回空)
- 主题化访问词汇(按 cat 分组)
- 分科进度与就绪度(readiness)持久化
- 兼容旧版 progress.json 结构自动迁移
"""

import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
VOCAB_FILE = os.path.join(DATA_DIR, "vocabulary.json")
PROGRESS_FILE = os.path.join(DATA_DIR, "progress.json")

# 备考六科目 + 贯穿模块 的内部键
SUBJECTS = ["lezen", "luisteren", "schrijven", "spreken", "knm", "ona"]
# 基于"最近N题正确率"判定就绪的科目
RATE_SUBJECTS = ["lezen", "luisteren", "knm", "woorden"]
RECENT_WINDOW = 20          # 就绪度采样窗口
READY_THRESHOLD = 0.80      # 达标正确率阈值


def _empty_progress():
    """全新进度结构。"""
    subjects = {}
    for s in RATE_SUBJECTS:
        subjects[s] = {"answered": 0, "correct": 0, "recent": []}
    return {
        "version": 2,
        "mastered": [],          # 已掌握单词 nl 列表
        "subjects": subjects,    # 分科答题统计
        "tasks": {},             # 写作/口语/ONA 等任务完成记录
    }


def _migrate(old):
    """把旧版 {mastered, answered, correct} 迁移到 v2 结构。"""
    new = _empty_progress()
    if isinstance(old.get("mastered"), list):
        new["mastered"] = old["mastered"]
    # 旧版答题统计视为词汇科成绩
    ans = int(old.get("answered", 0) or 0)
    cor = int(old.get("correct", 0) or 0)
    if ans:
        new["subjects"]["woorden"]["answered"] = ans
        new["subjects"]["woorden"]["correct"] = cor
    return new


class Store:
    """词库/题库/进度的统一入口。"""

    def __init__(self):
        self.words = self._load_words()
        self.progress = self._load_progress()

    # ---------- 词库 ----------
    def _load_words(self):
        try:
            with open(VOCAB_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("words", [])
        except Exception:
            return []

    def themes(self):
        """返回去重且排序的主题(cat)列表。"""
        seen = []
        for w in self.words:
            c = w.get("cat", "")
            if c and c not in seen:
                seen.append(c)
        return sorted(seen)

    def words_by_theme(self, theme=None):
        """按主题筛选单词;theme 为 None/空 返回全部。"""
        if not theme:
            return list(self.words)
        return [w for w in self.words if w.get("cat") == theme]

    # ---------- 题库(各科,可选) ----------
    def load_bank(self, subject):
        """加载 data/<subject>.json 的 items,缺失返回 []。"""
        path = os.path.join(DATA_DIR, f"{subject}.json")
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("items", [])
        except Exception:
            return []

    # ---------- 进度加载/保存 ----------
    def _load_progress(self):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return _empty_progress()
        # 版本判定与迁移
        if data.get("version") != 2 or "subjects" not in data:
            data = _migrate(data)
            self._save(data)
            return data
        # 补齐可能缺失的科目键
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
            print("保存进度失败:", e)

    def save(self):
        self._save(self.progress)

    # ---------- 答题记录与就绪度 ----------
    def record_answer(self, subject, correct):
        """记录一次答题结果并即时落盘。"""
        subs = self.progress["subjects"]
        if subject not in subs:
            subs[subject] = {"answered": 0, "correct": 0, "recent": []}
        s = subs[subject]
        s["answered"] = s.get("answered", 0) + 1
        if correct:
            s["correct"] = s.get("correct", 0) + 1
        recent = s.setdefault("recent", [])
        recent.append(1 if correct else 0)
        # 只保留窗口内最近记录
        if len(recent) > RECENT_WINDOW:
            del recent[:-RECENT_WINDOW]
        self.save()

    def readiness(self, subject):
        """返回 (rate, ready, sampled):最近窗口正确率、是否达标、样本数。"""
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

    # ---------- 已掌握单词 ----------
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

    # ---------- 概览 ----------
    def overview(self):
        """备考看板用:各科就绪度汇总。"""
        result = {}
        for s in RATE_SUBJECTS:
            rate, ready, sampled = self.readiness(s)
            result[s] = {"rate": rate, "ready": ready, "sampled": sampled}
        result["mastered_count"] = len(self.progress.get("mastered", []))
        result["total_words"] = len(self.words)
        return result