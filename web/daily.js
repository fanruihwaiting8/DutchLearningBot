/* 荷兰语 B1 备考助手 · 每日学习模块
 *
 * 职责:按日期生成「今天的任务单」并跟踪完成情况,保证每天固定学习量:
 *     15 个新词(学习卡) + 15 个复习词(选择题) + 1 篇阅读理解(3 题) + 8 句词序重组
 *     约 20 分钟。按用户要求不含听力。
 *
 * 设计要点:
 *   - 任务按「日期种子」生成:同一天刷新页面任务不变,换一天自动换新;
 *   - 新词优先取没学过的,复习词优先取做错过的(简易间隔重复);
 *   - 进度单独存 localStorage(dutch_b1_daily_v1),与 app.js 的总进度解耦,
 *     但答题会同时回写 app.js 的 Store,看板就绪度照常生效;
 *   - 通过 window.AppBridge 复用 app.js 的 Store / TTS / 路由,
 *     对外暴露 window.Daily.route() 与 window.Daily.summary()。
 */

(function () {
  'use strict';

  var WORDS = window.VOCAB || [];
  var LEZEN = window.LEZEN || [];
  var ZINNEN = window.ZINNEN || [];

  var LS_KEY = 'dutch_b1_daily_v1';
  var NEW_COUNT = 15;   // 每日新词
  var REV_COUNT = 15;   // 每日复习词
  var SENT_COUNT = 8;   // 每日句子

  var WORD_MAP = {};
  WORDS.forEach(function (w) { WORD_MAP[w.nl] = w; });

  // ===================== 与 app.js 的桥接 =====================
  function bridge() { return window.AppBridge || {}; }
  function store() { return bridge().Store; }
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    var b = bridge();
    if (b.esc) return b.esc(s);
    var d = document.createElement('div');
    d.textContent = (s == null ? '' : String(s));
    return d.innerHTML;
  }

  function ttsOk() {
    var b = bridge();
    return !!(b.TTS && b.TTS.available);
  }

  function speak(text) {
    var b = bridge();
    if (b.TTS && b.TTS.available) b.TTS.speak(text);
  }

  function go(route) {
    var b = bridge();
    if (b.navigate) b.navigate(route);
  }

  function record(subject, correct) {
    var s = store();
    if (s) s.recordAnswer(subject, correct);
  }

  // ===================== 日期与种子随机 =====================
  function dateStr(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /** 日期序号(距 1970-01-01 的天数),用 UTC 换算避免时区偏移 */
  function dayNumber(s) {
    var p = String(s).split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }

  function prevDate(s) {
    var p = String(s).split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() - 1);
    return dateStr(d);
  }

  /** mulberry32:小而稳的伪随机,同一种子序列固定 */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function seedFrom(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededShuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ===================== 每日进度存储 =====================
  var D = {
    data: null,

    empty: function () {
      return {
        version: 1,
        date: '',
        plan: null,
        progress: { cardIdx: 0, revIdx: 0, lezenIdx: 0, zinIdx: 0 },
        done: { words: false, lezen: false, zinnen: false },
        seen: [],      // 作为「新词」出现过的词(nl)
        wrong: {},     // nl -> 累计答错次数
        streak: 0,
        lastDone: '',
        history: []    // 已达成的日期,最多留 90 条
      };
    },

    load: function () {
      var d = null;
      try { d = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { d = null; }
      if (!d || d.version !== 1) d = this.empty();
      var base = this.empty();
      for (var k in base) {
        if (!Object.prototype.hasOwnProperty.call(d, k) || d[k] == null) d[k] = base[k];
      }
      if (!Array.isArray(d.seen)) d.seen = [];
      if (!Array.isArray(d.history)) d.history = [];
      this.data = d;
      return d;
    },

    save: function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) {}
    },

    reset: function () {
      this.data = this.empty();
      this.save();
    }
  };

  // ===================== 任务单生成 =====================
  function buildPlan(date) {
    var rnd = mulberry32(seedFrom(date));
    var st = store();
    var seenSet = {};
    D.data.seen.forEach(function (nl) { seenSet[nl] = 1; });

    // 新词:优先没学过的;词库学完后用随机词继续滚动,保证每天仍有学习卡
    var unseen = WORDS.filter(function (w) { return !seenSet[w.nl]; });
    var newList = seededShuffle(unseen.slice(), rnd).slice(0, NEW_COUNT);
    if (newList.length < NEW_COUNT) {
      var picked = {};
      newList.forEach(function (w) { picked[w.nl] = 1; });
      var fill = seededShuffle(WORDS.filter(function (w) { return !picked[w.nl]; }), rnd);
      newList = newList.concat(fill.slice(0, NEW_COUNT - newList.length));
    }
    var newSet = {};
    newList.forEach(function (w) { newSet[w.nl] = 1; });

    // 复习词:学过且不在今日新词里,错得多的优先,已标记掌握的往后排
    var wrong = D.data.wrong || {};
    var pool = seededShuffle(WORDS.filter(function (w) {
      return seenSet[w.nl] && !newSet[w.nl];
    }), rnd);
    pool.sort(function (a, b) {
      function score(w) {
        var s = (wrong[w.nl] || 0) * 2;
        if (st && st.isMastered(w.nl)) s -= 1;
        return s;
      }
      return score(b) - score(a);
    });
    var revList = pool.slice(0, REV_COUNT);
    if (revList.length < REV_COUNT) {
      // 刚开始学的头几天,学过的词还不够,用其他词补齐当天复习量
      var used = {};
      newList.concat(revList).forEach(function (w) { used[w.nl] = 1; });
      var extra = seededShuffle(WORDS.filter(function (w) { return !used[w.nl]; }), rnd);
      revList = revList.concat(extra.slice(0, REV_COUNT - revList.length));
    }

    var dn = dayNumber(date);
    var passageId = '';
    if (LEZEN.length) {
      passageId = LEZEN[((dn % LEZEN.length) + LEZEN.length) % LEZEN.length].id;
    }
    var sentences = [];
    if (ZINNEN.length) {
      var start = ((dn * SENT_COUNT) % ZINNEN.length + ZINNEN.length) % ZINNEN.length;
      for (var i = 0; i < SENT_COUNT && i < ZINNEN.length; i++) {
        sentences.push((start + i) % ZINNEN.length);
      }
    }

    return {
      newWords: newList.map(function (w) { return w.nl; }),
      revWords: revList.map(function (w) { return w.nl; }),
      passageId: passageId,
      sentences: sentences
    };
  }

  /** 保证 D.data 是「今天」的任务单;跨天自动换新 */
  function ensureToday() {
    if (!D.data) D.load();
    var today = dateStr();
    if (D.data.date !== today || !D.data.plan) {
      D.data.date = today;
      D.data.plan = buildPlan(today);
      D.data.progress = { cardIdx: 0, revIdx: 0, lezenIdx: 0, zinIdx: 0 };
      D.data.done = { words: false, lezen: false, zinnen: false };
      D.save();
    }
    return D.data;
  }

  function wordsOf(list) {
    var out = [];
    (list || []).forEach(function (nl) {
      if (WORD_MAP[nl]) out.push(WORD_MAP[nl]);
    });
    return out;
  }

  function passage() {
    var id = D.data.plan ? D.data.plan.passageId : '';
    for (var i = 0; i < LEZEN.length; i++) {
      if (LEZEN[i].id === id) return LEZEN[i];
    }
    return null;
  }

  function sentenceList() {
    var out = [];
    ((D.data.plan && D.data.plan.sentences) || []).forEach(function (i) {
      if (ZINNEN[i]) out.push(ZINNEN[i]);
    });
    return out;
  }

  /** 三段任务各自的完成度,用于进度条与任务单状态 */
  function progress() {
    var p = D.data.progress;
    var plan = D.data.plan || { newWords: [], revWords: [] };
    var ps = passage();
    var qTotal = ps ? ps.questions.length : 0;
    var sTotal = sentenceList().length;
    var nTotal = plan.newWords.length, rTotal = plan.revWords.length;
    var words = {
      done: Math.min(p.cardIdx, nTotal) + Math.min(p.revIdx, rTotal),
      total: nTotal + rTotal
    };
    var lezen = { done: Math.min(p.lezenIdx, qTotal), total: qTotal };
    var zinnen = { done: Math.min(p.zinIdx, sTotal), total: sTotal };
    var all = words.total + lezen.total + zinnen.total;
    var got = words.done + lezen.done + zinnen.done;
    return {
      words: words, lezen: lezen, zinnen: zinnen,
      total: all, got: got,
      pct: all ? Math.round(got / all * 100) : 0,
      sections: (D.data.done.words ? 1 : 0) + (D.data.done.lezen ? 1 : 0) + (D.data.done.zinnen ? 1 : 0)
    };
  }

  function markWrong(nl) {
    D.data.wrong[nl] = (D.data.wrong[nl] || 0) + 1;
    D.save();
  }

  function markSeen(nl) {
    if (D.data.seen.indexOf(nl) < 0) {
      D.data.seen.push(nl);
      D.save();
    }
  }

  /** 某一段完成 -> 落盘;三段都完成则记今日达成并累加连续天数 */
  function finishSection(key) {
    D.data.done[key] = true;
    if (D.data.done.words && D.data.done.lezen && D.data.done.zinnen) {
      var today = D.data.date;
      if (D.data.lastDone !== today) {
        D.data.streak = (D.data.lastDone === prevDate(today)) ? (D.data.streak || 0) + 1 : 1;
        D.data.lastDone = today;
        D.data.history.push(today);
        if (D.data.history.length > 90) D.data.history = D.data.history.slice(-90);
      }
    }
    D.save();
  }

  /** 给看板用的今日概览 */
  function summary() {
    ensureToday();
    var pr = progress();
    // 连续天数:只有昨天或今天达成过才算仍在连中
    var st = D.data.streak || 0;
    if (D.data.lastDone !== D.data.date && D.data.lastDone !== prevDate(D.data.date)) st = 0;
    return {
      date: D.data.date,
      pct: pr.pct,
      got: pr.got,
      total: pr.total,
      sections: pr.sections,
      allDone: pr.sections === 3,
      streak: st
    };
  }

  // ===================== 任务单 =====================
  var SECTIONS = [
    ['words', 'daily-words', '单词 Woorden', '15 个新词 + 15 个复习词'],
    ['lezen', 'daily-lezen', '阅读 Lezen', '1 篇短文 + 3 道理解题'],
    ['zinnen', 'daily-zinnen', '句子 Zinnen', '8 句词序重组']
  ];

  function firstUnfinished() {
    for (var i = 0; i < SECTIONS.length; i++) {
      if (!D.data.done[SECTIONS[i][0]]) return SECTIONS[i][1];
    }
    return '';
  }

  function renderDaily() {
    ensureToday();
    var pr = progress();
    var sm = summary();
    var md = D.data.date.slice(5).replace('-', ' / ');

    var html = '<div class="card">' +
      '<div class="card-head"><span>今日任务 · ' + esc(md) + '</span>' +
      '<span class="muted">' + pr.pct + '%</span></div>' +
      '<div class="bar"><i style="width:' + pr.pct + '%"></i></div>' +
      '<p class="foot-note" style="margin-top:10px">已完成 ' + pr.got + ' / ' + pr.total +
      ' 项 · 三段全做完才算今日达成' +
      (sm.streak > 0 ? ' · 连续打卡 ' + sm.streak + ' 天 🔥' : '') + '</p></div>';

    html += '<div class="subj-list">';
    SECTIONS.forEach(function (s) {
      var key = s[0], route = s[1], name = s[2], sub = s[3];
      var p = pr[key];
      var done = D.data.done[key];
      var status, color;
      if (done) { status = '✓ 已完成'; color = 'var(--ok)'; }
      else if (p.done > 0) { status = '进行中 ' + p.done + ' / ' + p.total; color = 'var(--warn)'; }
      else { status = '未开始 · ' + p.total + ' 项'; color = 'var(--muted)'; }
      html += '<div class="subj clickable" data-go="' + route + '">' +
        '<div class="subj-main"><div class="subj-name">' + esc(name) + '</div>' +
        '<div class="subj-sub">' + esc(sub) + '</div>' +
        '<div class="subj-status" style="color:' + color + '">' + esc(status) + '</div></div>' +
        '<div class="subj-arrow">›</div></div>';
    });
    html += '</div>';

    if (pr.sections === 3) {
      html += '<div class="tip"><div class="tip-label">今日达成</div>' +
        '<p class="tip-text">今天的学习量已完成,明天会自动换一批新内容。' +
        '想多练可以去「词汇」自由刷题。</p></div>' +
        '<button class="btn block" id="daily-more">去自由练词汇</button>';
    } else {
      html += '<button class="btn block" id="daily-go">继续今日学习</button>';
    }
    html +='<button class="btn grey block" id="daily-redo">重做今天的任务</button>' +
      '<p class="foot-note">任务按日期生成:同一天刷新不变,到第二天自动更新。</p>';

    var view = $('view');
    view.innerHTML = html;
    view.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () { go(el.getAttribute('data-go')); });
    });
    if ($('daily-go')) {
      $('daily-go').addEventListener('click', function () { go(firstUnfinished() || 'daily'); });
    }
    if ($('daily-more')) {
      $('daily-more').addEventListener('click', function () { go('woorden'); });
    }
    $('daily-redo').addEventListener('click', function () {
      if (!window.confirm('清空今天的作答记录,重新做一遍今日任务?')) return;
      D.data.progress = { cardIdx: 0, revIdx: 0, lezenIdx: 0, zinIdx: 0 };
      D.data.done = { words: false, lezen: false, zinnen: false };
      D.save();
      renderDaily();
    });
  }

  /** 每段做完后的收尾页:顺手把下一段入口给出来 */
  function doneCard(box, title, nextRoute, nextLabel) {
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-body"><div class="word-zh" style="margin-top:0">' +
      esc(title) + '</div><p class="hint">今日这一段已完成。</p></div>';
    box.appendChild(card);

    var b = document.createElement('button');
    b.className = 'btn block';
    b.textContent = nextLabel;
    b.addEventListener('click', function () { go(nextRoute); });
    box.appendChild(b);

    var back = document.createElement('button');
    back.className = 'btn grey block';
    back.textContent = '回今日任务单';
    back.addEventListener('click', function () { go('daily'); });
    box.appendChild(back);
  }

  // ===================== 单词:学习卡 + 复习选择题 =====================
  var S = { qi: -1, opts: [], correct: '', picked: null, answered: false };

  function renderWords() {
    ensureToday();
    var box = $('view');
    box.innerHTML = '';
    var news = wordsOf(D.data.plan.newWords);
    var revs = wordsOf(D.data.plan.revWords);
    var p = D.data.progress;

    if (p.cardIdx < news.length) { drawCard(box, news, p.cardIdx); return; }
    if (p.revIdx < revs.length) { drawRev(box, revs, p.revIdx); return; }
    if (!D.data.done.words) finishSection('words');
    doneCard(box, '今日单词已完成', 'daily-lezen', '去做今日阅读');
  }

  function speakBtn(text, label, ghost) {
    var b = document.createElement('button');
    b.className = 'speak-btn'+ (ghost ? ' ghost' : '');
    b.textContent = '🔊 ' + label;
    b.addEventListener('click', function (e) { e.stopPropagation(); speak(text); });
    return b;
  }

  /** 新词学习卡:正面直接给出释义与例句,目标是「见过并读一遍」 */
  function drawCard(box, list, idx) {
    var w = list[idx];
    var st = store();
    var mastered = st ? st.isMastered(w.nl) : false;

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><span class="muted">新词 ' + (idx + 1) + ' / ' + list.length +
      '</span><span class="ok-tag">' + (mastered ? '★ 已掌握' : '') + '</span></div>' +
      '<div class="card-body"><div class="word-nl">' + esc(w.nl) + '</div></div>';
    var body = card.querySelector('.card-body');
    if (ttsOk()) body.appendChild(speakBtn(w.nl, '朗读'));
    var zh = document.createElement('div');
    zh.className = 'word-zh';
    zh.textContent = w.zh;
    body.appendChild(zh);
    if (w.cat) {
      var cat = document.createElement('p');
      cat.className = 'hint';
      cat.textContent = w.cat;
      body.appendChild(cat);
    }
    if (w.ex_nl) {
      var e1 = document.createElement('div');
      e1.className = 'ex-nl';
      e1.textContent = w.ex_nl;
      body.appendChild(e1);
      var e2 = document.createElement('div');
      e2.className = 'ex-zh';
      e2.textContent = w.ex_zh || '';
      body.appendChild(e2);
      if (ttsOk()) body.appendChild(speakBtn(w.ex_nl, '朗读例句', true));
    }
    box.appendChild(card);

    var row = document.createElement('div');
    row.className = 'row-btns';
    var mb = document.createElement('button');
    mb.className = 'btn ' + (mastered ? 'red' : 'green');
    mb.textContent = mastered ? '取消掌握' : '标记已掌握';
    mb.addEventListener('click', function () {
      if (st) st.toggleMastered(w.nl);
      renderWords();
    });
    var nb = document.createElement('button');
    nb.className = 'btn';
    nb.textContent = (idx + 1 < list.length) ? '记住了,下一张' : '记住了,去复习题';
    nb.addEventListener('click', function () {
      markSeen(w.nl);
      D.data.progress.cardIdx = idx + 1;
      D.save();
      renderWords();
    });
    row.appendChild(mb);
    row.appendChild(nb);
    box.appendChild(row);
  }

  /** 复习词:荷→中四选一,错词计数进 wrong,后续几天会优先再出 */
  function drawRev(box, list, idx) {
    var w = list[idx];
    if (S.qi !== idx || !S.opts.length) {
      var others = WORDS.filter(function (x) { return x.zh !== w.zh; })
                        .map(function (x) { return x.zh; });
      var rnd = mulberry32(seedFrom(D.data.date + '#rev' + idx));
      seededShuffle(others, rnd);
      S.opts = seededShuffle(others.slice(0, 3).concat([w.zh]), rnd);
      S.correct = w.zh;
      S.qi = idx;
      S.picked = null;
      S.answered = false;
    }

    var head = document.createElement('div');
    head.className = 'card';
    head.innerHTML = '<div class="card-head"><span class="muted">复习 ' + (idx + 1) + ' / ' + list.length +
      '</span></div><div class="card-body"><p class="prompt-ask">选择对应的中文</p>' +
      '<div class="word-nl">' + esc(w.nl) + '</div></div>';
    if (ttsOk()) head.querySelector('.card-body').appendChild(speakBtn(w.nl, '朗读'));
    box.appendChild(head);

    S.opts.forEach(function (opt) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.textContent = opt;
      if (S.answered) {
        if (opt === S.correct) b.classList.add('right');
        else if (opt === S.picked) b.classList.add('wrong');
      }
      b.addEventListener('click', function () {
        if (S.answered) return;
        S.answered = true;
        S.picked = opt;
        var ok = (opt === S.correct);
        record('woorden', ok);
        if (!ok) markWrong(w.nl);
        box.innerHTML = '';
        drawRev(box, list, idx);
      });
      box.appendChild(b);
    });

    if (S.answered) {
      if (w.ex_nl) {
        var ex = document.createElement('div');
        ex.className = 'card';
        ex.innerHTML = '<div class="ex-nl" style="margin-top:0">' + esc(w.ex_nl) + '</div>' +
          '<div class="ex-zh">' + esc(w.ex_zh || '') + '</div>';
        box.appendChild(ex);
      }
      var next = document.createElement('button');
      next.className = 'btn block';
      next.textContent = (idx + 1 < list.length) ? '下一题' : '完成单词部分';
      next.addEventListener('click', function () {
        D.data.progress.revIdx = idx + 1;
        D.save();
        S.qi = -1;
        renderWords();
      });
      box.appendChild(next);
    }
  }

  // ===================== 阅读理解 =====================
  var L = { qi: -1, picked: -1, answered: false, showZh: false };

  function renderLezen() {
    ensureToday();
    var box = $('view');
    box.innerHTML = '';
    var ps = passage();
    if (!ps) {
      box.innerHTML = '<div class="card"><div class="card-body"><p class="hint">暂无阅读素材。</p></div></div>';
      return;
    }

    // 短文常驻在上方,答题时可随时回看
    var art = document.createElement('div');
    art.className = 'card';
    art.innerHTML = '<div class="card-head"><span>' + esc(ps.title) + '</span>' +
      '<span class="muted">' + esc(ps.theme || '') + '</span></div>';
    var body = document.createElement('div');
    body.className = 'card-body lezen-body';
    var nl = document.createElement('p');
    nl.className = 'lezen-text';
    nl.textContent = ps.text;
    body.appendChild(nl);
    if (L.showZh) {
      var zh = document.createElement('p');
      zh.className = 'lezen-text zh';
      zh.textContent = ps.zh_text || '';
      body.appendChild(zh);
    }
    art.appendChild(body);
    box.appendChild(art);

    var row = document.createElement('div');
    row.className = 'row-btns';
    var tb = document.createElement('button');
    tb.className = 'btn grey';
    tb.textContent = L.showZh ? '隐藏中文' : '显示中文';
    tb.addEventListener('click', function () { L.showZh = !L.showZh; renderLezen(); });
    row.appendChild(tb);
    if (ttsOk()) {
      var sb = document.createElement('button');
      sb.className = 'btn grey';
      sb.textContent = '🔊 朗读短文';
      sb.addEventListener('click', function () { speak(ps.text); });
      row.appendChild(sb);
    }
    box.appendChild(row);

    var idx = D.data.progress.lezenIdx;
    if (idx >= ps.questions.length) {
      if (!D.data.done.lezen) finishSection('lezen');
      doneCard(box, '今日阅读已完成', 'daily-zinnen', '去做今日句子');
      return;
    }
    drawLezenQ(box, ps, idx);
  }

  function drawLezenQ(box, ps, idx) {
    var q = ps.questions[idx];
    if (L.qi !== idx) { L.qi = idx; L.picked = -1; L.answered = false; }

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><span class="muted">第 ' + (idx + 1) + ' / ' +
      ps.questions.length + ' 题</span></div>' +
      '<div class="card-body"><p class="q-text">' + esc(q.q) + '</p></div>';
    box.appendChild(card);

    q.options.forEach(function (opt, i) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.textContent = opt;
      if (L.answered) {
        if (i === q.answer) b.classList.add('right');
        else if (i === L.picked) b.classList.add('wrong');
      }
      b.addEventListener('click', function () {
        if (L.answered) return;
        L.answered = true;
        L.picked = i;
        record('lezen', i === q.answer);
        renderLezen();
      });
      box.appendChild(b);
    });

    if (L.answered) {
      var tip = document.createElement('div');
      tip.className = 'card';
      tip.innerHTML = '<div class="card-body"><p class="result ' +
        (L.picked === q.answer ? 'right' : 'wrong') + '" style="margin:0 0 6px">' +
        (L.picked === q.answer ? '✓ 正确' : '✗ 正确答案:' + esc(q.options[q.answer])) + '</p>' +
        '<p class="ex-zh" style="margin:0">' + esc(q.zh || '') + '</p></div>';
      box.appendChild(tip);

      var next = document.createElement('button');
      next.className = 'btn block';
      next.textContent = (idx + 1 < ps.questions.length) ? '下一题' : '完成阅读部分';
      next.addEventListener('click', function () {
        D.data.progress.lezenIdx = idx + 1;
        D.save();
        L.qi = -1;
        renderLezen();
      });
      box.appendChild(next);
    }
  }

  // ===================== 句子:词序重组 =====================
  var Z = { idx: -1, pool: [], placed: [], checked: false, ok: false };

  function loadSentence(idx, sent) {
    var words = String(sent.nl).split(/\s+/).filter(function (x) { return x; });
    var items = words.map(function (t, i) { return { k: i, t: t }; });
    var rnd = mulberry32(seedFrom(D.data.date + '#zin' + idx));
    var pool = seededShuffle(items.slice(), rnd);
    // 打乱后如果恰好仍是原顺序,整体轮转一位,避免「免费答对」
    var same = pool.every(function (it, i) { return it.k === i; });
    if (same && pool.length > 1) pool.push(pool.shift());
    Z.idx = idx;
    Z.pool = pool;
    Z.placed = [];
    Z.checked = false;
    Z.ok = false;
  }

  function renderZinnen() {
    ensureToday();
    var box = $('view');
    box.innerHTML = '';
    var list = sentenceList();
    if (!list.length) {
      box.innerHTML = '<div class="card"><div class="card-body"><p class="hint">暂无句子素材。</p></div></div>';
      return;
    }
    var idx = D.data.progress.zinIdx;
    if (idx >= list.length) {
      if (!D.data.done.zinnen) finishSection('zinnen');
      doneCard(box, '今日句子已完成', 'daily', '看今日完成情况');
      return;
    }
    if (Z.idx !== idx) loadSentence(idx, list[idx]);
    drawZin(box, list, idx);
  }

  function chip(item, placed, onTap) {
    var b = document.createElement('button');
    b.className = 'chip' + (placed ? ' placed' : '');
    b.textContent = item.t;
    if (onTap) b.addEventListener('click', onTap);
    else b.disabled = true;
    return b;
  }

  function drawZin(box, list, idx) {
    var sent = list[idx];
    box.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><span class="muted">句子 ' + (idx + 1) + ' / ' + list.length +
      '</span><span class="muted">' + esc(sent.tag || '') + '</span></div>' +
      '<div class="card-body"><p class="prompt-ask">点词块,拼出下面这句荷兰语</p>' +
      '<div class="word-zh" style="margin-top:4px">' + esc(sent.zh) + '</div></div>';
    box.appendChild(card);

    // 答案区
    var ans = document.createElement('div');
    ans.className = 'chip-zone answer' + (Z.checked ? (Z.ok ? ' ok' : ' bad') : '');
    if (!Z.placed.length) {
      var ph = document.createElement('span');
      ph.className = 'chip-ph';
      ph.textContent = '在这里组句';
      ans.appendChild(ph);
    }
    Z.placed.forEach(function (it, i) {
      ans.appendChild(chip(it, true, Z.checked ? null : function () {
        Z.placed.splice(i, 1);
        Z.pool.push(it);
        drawZin(box, list, idx);
      }));
    });
    box.appendChild(ans);

    // 候选区
    var pool = document.createElement('div');
    pool.className = 'chip-zone';
    Z.pool.forEach(function (it, i) {
      pool.appendChild(chip(it, false, Z.checked ? null : function () {
        Z.pool.splice(i, 1);
        Z.placed.push(it);
        drawZin(box, list, idx);
      }));
    });
    box.appendChild(pool);

    if (!Z.checked) {
      var row = document.createElement('div');
      row.className = 'row-btns';
      var clr = document.createElement('button');
      clr.className = 'btn grey';
      clr.textContent = '清空';
      clr.addEventListener('click', function () {
        Z.pool = Z.pool.concat(Z.placed);
        Z.placed = [];
        drawZin(box, list, idx);
      });
      var sub = document.createElement('button');
      sub.className = 'btn';
      sub.textContent = '提交';
      sub.disabled = Z.pool.length > 0;
      sub.addEventListener('click', function () {
        if (Z.pool.length) return;
        Z.checked = true;
        Z.ok = Z.placed.every(function (it, i) { return it.k === i; });
        record('zinnen', Z.ok);
        speak(sent.nl);
        drawZin(box, list, idx);
      });
      row.appendChild(clr);
      row.appendChild(sub);
      box.appendChild(row);
      if (Z.pool.length) {
        var hint = document.createElement('p');
        hint.className = 'foot-note';
        hint.textContent = '把所有词块都放进答案区才能提交;点答案区的词块可以取回。';
        box.appendChild(hint);
      }
      return;
    }

    var res = document.createElement('div');
    res.className = 'card';
    res.innerHTML = '<div class="card-body"><p class="result ' + (Z.ok ? 'right' : 'wrong') +
      '" style="margin:0 0 8px">' + (Z.ok ? '✓ 语序正确' : '✗ 正确语序如下') + '</p>' +
      '<div class="ex-nl" style="margin-top:0">' + esc(sent.nl) + '</div>' +
      '<div class="ex-zh">' + esc(sent.zh) + '</div></div>';
    box.appendChild(res);
    if (ttsOk()) {
      var sp = speakBtn(sent.nl, '再听一遍', true);
      sp.style.display = 'block';
      sp.style.margin = '0 auto 12px';
      box.appendChild(sp);
    }

    var next = document.createElement('button');
    next.className = 'btn block';
    next.textContent = (idx + 1 < list.length) ? '下一句' : '完成句子部分';
    next.addEventListener('click', function () {
      D.data.progress.zinIdx = idx + 1;
      D.save();
      Z.idx = -1;
      renderZinnen();
    });
    box.appendChild(next);
  }

  // ===================== 对外接口 =====================
  function route(r) {
    ensureToday();
    if (r === 'daily-words') renderWords();
    else if (r === 'daily-lezen') renderLezen();
    else if (r === 'daily-zinnen') renderZinnen();
    else renderDaily();
  }

  window.Daily = {
    route: route,
    summary: summary,
    reset: function () { D.reset(); }
  };
})();