/* Dutch B1 Exam Trainer - Daily Study module
 *
 * Purpose: build "today's task list" from the date and track its completion so
 * that the daily workload stays constant:
 *     15 new words (flashcards) + 15 review words (multiple choice)
 *     + 1 reading passage (3 questions) + 8 word-order sentences
 *     About 20 minutes. No listening section, per the user's request.
 *
 * Design notes:
 *   - Tasks are generated from a "date seed": reloading the page on the same
 *     day keeps the same tasks, a new day brings a fresh batch;
 *   - New words prefer unseen entries, review words prefer previously missed
 *     ones (a simple spaced-repetition heuristic);
 *   - Progress lives in its own localStorage key (dutch_b1_daily_v1), decoupled
 *     from the overall progress kept by app.js, but every answer is also written
 *     back into the app.js Store so dashboard readiness keeps working;
 *   - Store / TTS / routing are reused from app.js through window.AppBridge,
 *     and window.Daily.route() / window.Daily.summary() are exposed outwards.
 */

(function () {
  'use strict';

  var WORDS = window.VOCAB || [];
  var LEZEN = window.LEZEN || [];
  var ZINNEN = window.ZINNEN || [];

  var LS_KEY = 'dutch_b1_daily_v1';
  var NEW_COUNT = 15;   // new words per day
  var REV_COUNT = 15;   // review words per day
  var SENT_COUNT = 8;   // sentences per day

  var WORD_MAP = {};
  WORDS.forEach(function (w) { WORD_MAP[w.nl] = w; });

  // ===================== Bridge to app.js =====================
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

  // ===================== Dates and seeded randomness =====================
  function dateStr(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  /** Day index (days since 1970-01-01), computed in UTC to avoid timezone drift */
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

  /** mulberry32: small, stable PRNG - the same seed always yields the same sequence */
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

  // ===================== Daily progress storage =====================
  var D = {
    data: null,

    empty: function () {
      return {
        version: 1,
        date: '',
        plan: null,
        progress: { cardIdx: 0, revIdx: 0, lezenIdx: 0, zinIdx: 0 },
        done: { words: false, lezen: false, zinnen: false },
        seen: [],      // words (nl) already shown as "new words"
        wrong: {},     // nl -> cumulative number of wrong answers
        streak: 0,
        lastDone: '',
        history: []    // completed dates, capped at 90 entries
      };
    },

    /** Storage key of the active profile (falls back to the plain key) */
    storeKey: function () {
      var U = window.AppBridge && window.AppBridge.Users;
      return (U && U.data) ? U.key(LS_KEY) : LS_KEY;
    },

    load: function () {
      var d = null;
      try { d = JSON.parse(localStorage.getItem(this.storeKey()) || 'null'); } catch (e) { d = null; }
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
      try { localStorage.setItem(this.storeKey(), JSON.stringify(this.data)); } catch (e) {}
    },

    reset: function () {
      this.data = this.empty();
      this.save();
    }
  };

  // ===================== Task list generation =====================
  function buildPlan(date) {
    var rnd = mulberry32(seedFrom(date));
    var st = store();
    var seenSet = {};
    D.data.seen.forEach(function (nl) { seenSet[nl] = 1; });

    // New words: unseen first; once the deck is exhausted keep rolling with
    // random words so there are always flashcards to study
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

    // Review words: already seen and not in today's new words; the most often
    // missed come first, words marked as mastered are pushed back
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
      // During the first days there are not enough seen words yet, so fill the
      // daily review quota with other words
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

  /** Make sure D.data holds *today's* task list; it rolls over automatically */
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

  /** Completion of each of the three sections, used by the bar and the task list */
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

  /** A section is finished -> persist it; when all three are done record the
   *  daily goal and extend the streak */
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

  /** Today's overview, consumed by the dashboard */
  function summary() {
    ensureToday();
    var pr = progress();
    // Streak: only alive if the goal was met today or yesterday
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

  // ===================== Task list =====================
  var SECTIONS = [
    ['words', 'daily-words', 'Words / Woorden', '15 new words + 15 review words'],
    ['lezen', 'daily-lezen', 'Reading / Lezen', '1 passage + 3 comprehension questions'],
    ['zinnen', 'daily-zinnen', 'Sentences / Zinnen', '8 word-order exercises']
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
      '<div class="card-head"><span>Today\'s tasks - ' + esc(md) + '</span>' +
      '<span class="muted">' + pr.pct + '%</span></div>' +
      '<div class="bar"><i style="width:' + pr.pct + '%"></i></div>' +
      '<p class="foot-note" style="margin-top:10px">Done ' + pr.got + ' / ' + pr.total +
      ' items - the day counts only when all three sections are finished' +
      (sm.streak > 0 ? ' - ' + sm.streak + '-day streak' : '') + '</p></div>';

    html += '<div class="subj-list">';
    SECTIONS.forEach(function (s) {
      var key = s[0], route = s[1], name = s[2], sub = s[3];
      var p = pr[key];
      var done = D.data.done[key];
      var status, color;
      if (done) { status = 'Completed'; color = 'var(--ok)'; }
      else if (p.done > 0) { status = 'In progress ' + p.done + ' / ' + p.total; color = 'var(--warn)'; }
      else { status = 'Not started - ' + p.total + ' items'; color = 'var(--muted)'; }
      html += '<div class="subj clickable" data-go="' + route + '">' +
        '<div class="subj-main"><div class="subj-name">' + esc(name) + '</div>' +
        '<div class="subj-sub">' + esc(sub) + '</div>' +
        '<div class="subj-status" style="color:' + color + '">' + esc(status) + '</div></div>' +
        '<div class="subj-arrow">›</div></div>';
    });
    html += '</div>';

    if (pr.sections === 3) {
      html += '<div class="tip"><div class="tip-label">Daily goal reached</div>' +
        '<p class="tip-text">Today\'s workload is complete. A fresh batch arrives tomorrow. ' +
        'Want more practice? Head to Vocabulary for free drilling.</p></div>' +
        '<button class="btn block" id="daily-more">Practise vocabulary freely</button>';
    } else {
      html += '<button class="btn block" id="daily-go">Continue today\'s study</button>';
    }
    html +='<button class="btn grey block" id="daily-redo">Redo today\'s tasks</button>' +
      '<p class="foot-note">Tasks are generated from the date: reloading today changes nothing, tomorrow brings a new set.</p>';

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
      if (!window.confirm('Clear today\'s answers and start the daily tasks over?')) return;
      D.data.progress = { cardIdx: 0, revIdx: 0, lezenIdx: 0, zinIdx: 0 };
      D.data.done = { words: false, lezen: false, zinnen: false };
      D.save();
      renderDaily();
    });
  }

  /** Wrap-up screen after a section: also offer the entry to the next one */
  function doneCard(box, title, nextRoute, nextLabel) {
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-body"><div class="word-en" style="margin-top:0">' +
      esc(title) + '</div><p class="hint">This section is done for today.</p></div>';
    box.appendChild(card);

    var b = document.createElement('button');
    b.className = 'btn block';
    b.textContent = nextLabel;
    b.addEventListener('click', function () { go(nextRoute); });
    box.appendChild(b);

    var back = document.createElement('button');
    back.className = 'btn grey block';
    back.textContent = 'Back to task list';
    back.addEventListener('click', function () { go('daily'); });
    box.appendChild(back);
  }

  // ===================== Words: flashcards + review quiz =====================
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
    doneCard(box, 'Words done for today', 'daily-lezen', "Go to today's reading");
  }

  function speakBtn(text, label, ghost) {
    var b = document.createElement('button');
    b.className = 'speak-btn'+ (ghost ? ' ghost' : '');
    b.textContent = '\u25B6 ' + label;
    b.addEventListener('click', function (e) { e.stopPropagation(); speak(text); });
    return b;
  }

  /** New-word flashcard: meaning and example are shown right away; the goal is
   *  simply to see the word once and read it aloud */
  function drawCard(box, list, idx) {
    var w = list[idx];
    var st = store();
    var mastered = st ? st.isMastered(w.nl) : false;

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><span class="muted">New word ' + (idx + 1) + ' / ' + list.length +
      '</span><span class="ok-tag">' + (mastered ? 'Mastered' : '') + '</span></div>' +
      '<div class="card-body"><div class="word-nl">' + esc(w.nl) + '</div></div>';
    var body = card.querySelector('.card-body');
    if (ttsOk()) body.appendChild(speakBtn(w.nl, 'Listen'));
    var en = document.createElement('div');
    en.className = 'word-en';
    en.textContent = w.en;
    body.appendChild(en);
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
      e2.className = 'ex-en';
      e2.textContent = w.ex_en || '';
      body.appendChild(e2);
      if (ttsOk()) body.appendChild(speakBtn(w.ex_nl, 'Listen to example', true));
    }
    box.appendChild(card);

    var row = document.createElement('div');
    row.className = 'row-btns';
    var mb = document.createElement('button');
    mb.className = 'btn ' + (mastered ? 'red' : 'green');
    mb.textContent = mastered ? 'Unmark mastered' : 'Mark as mastered';
    mb.addEventListener('click', function () {
      if (st) st.toggleMastered(w.nl);
      renderWords();
    });
    var nb = document.createElement('button');
    nb.className = 'btn';
    nb.textContent = (idx + 1 < list.length) ? 'Got it, next card' : 'Got it, go to review';
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

  /** Review words: Dutch -> English multiple choice. Misses are counted in
   *  `wrong` so those words come back sooner on later days */
  function drawRev(box, list, idx) {
    var w = list[idx];
    if (S.qi !== idx || !S.opts.length) {
      var others = WORDS.filter(function (x) { return x.en !== w.en; })
                        .map(function (x) { return x.en; });
      var rnd = mulberry32(seedFrom(D.data.date + '#rev' + idx));
      seededShuffle(others, rnd);
      S.opts = seededShuffle(others.slice(0, 3).concat([w.en]), rnd);
      S.correct = w.en;
      S.qi = idx;
      S.picked = null;
      S.answered = false;
    }

    var head = document.createElement('div');
    head.className = 'card';
    head.innerHTML = '<div class="card-head"><span class="muted">Review ' + (idx + 1) + ' / ' + list.length +
      '</span></div><div class="card-body"><p class="prompt-ask">Pick the English meaning</p>' +
      '<div class="word-nl">' + esc(w.nl) + '</div></div>';
    if (ttsOk()) head.querySelector('.card-body').appendChild(speakBtn(w.nl, 'Listen'));
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
          '<div class="ex-en">' + esc(w.ex_en || '') + '</div>';
        box.appendChild(ex);
      }
      var next = document.createElement('button');
      next.className = 'btn block';
      next.textContent = (idx + 1 < list.length) ? 'Next question' : 'Finish the words section';
      next.addEventListener('click', function () {
        D.data.progress.revIdx = idx + 1;
        D.save();
        S.qi = -1;
        renderWords();
      });
      box.appendChild(next);
    }
  }

  // ===================== Reading comprehension =====================
  var L = { qi: -1, picked: -1, answered: false, showEn: false };

  function renderLezen() {
    ensureToday();
    var box = $('view');
    box.innerHTML = '';
    var ps = passage();
    if (!ps) {
      box.innerHTML = '<div class="card"><div class="card-body"><p class="hint">No reading material yet.</p></div></div>';
      return;
    }

    // The passage stays on top so it can be re-read while answering
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
    if (L.showEn) {
      var tr = document.createElement('p');
      tr.className = 'lezen-text en';
      tr.textContent = ps.en_text || '';
      body.appendChild(tr);
    }
    art.appendChild(body);
    box.appendChild(art);

    var row = document.createElement('div');
    row.className = 'row-btns';
    var tb = document.createElement('button');
    tb.className = 'btn grey';
    tb.textContent = L.showEn ? 'Hide translation' : 'Show translation';
    tb.addEventListener('click', function () { L.showEn = !L.showEn; renderLezen(); });
    row.appendChild(tb);
    if (ttsOk()) {
      var sb = document.createElement('button');
      sb.className = 'btn grey';
      sb.textContent = '\u25B6 Read the passage';
      sb.addEventListener('click', function () { speak(ps.text); });
      row.appendChild(sb);
    }
    box.appendChild(row);

    var idx = D.data.progress.lezenIdx;
    if (idx >= ps.questions.length) {
      if (!D.data.done.lezen) finishSection('lezen');
      doneCard(box, 'Reading done for today', 'daily-zinnen', "Go to today's sentences");
      return;
    }
    drawLezenQ(box, ps, idx);
  }

  function drawLezenQ(box, ps, idx) {
    var q = ps.questions[idx];
    if (L.qi !== idx) { L.qi = idx; L.picked = -1; L.answered = false; }

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><span class="muted">Question ' + (idx + 1) + ' / ' +
      ps.questions.length + '</span></div>' +
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
        (L.picked === q.answer ? 'Correct' : 'Wrong - correct answer: ' + esc(q.options[q.answer])) + '</p>' +
        '<p class="ex-en" style="margin:0">' + esc(q.en || '') + '</p></div>';
      box.appendChild(tip);

      var next = document.createElement('button');
      next.className = 'btn block';
      next.textContent = (idx + 1 < ps.questions.length) ? 'Next question' : 'Finish the reading section';
      next.addEventListener('click', function () {
        D.data.progress.lezenIdx = idx + 1;
        D.save();
        L.qi = -1;
        renderLezen();
      });
      box.appendChild(next);
    }
  }

  // ===================== Sentences: word order =====================
  var Z = { idx: -1, pool: [], placed: [], checked: false, ok: false };

  function loadSentence(idx, sent) {
    var words = String(sent.nl).split(/\s+/).filter(function (x) { return x; });
    var items = words.map(function (t, i) { return { k: i, t: t }; });
    var rnd = mulberry32(seedFrom(D.data.date + '#zin' + idx));
    var pool = seededShuffle(items.slice(), rnd);
    // If the shuffle happens to keep the original order, rotate by one so the
    // answer is never free
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
      box.innerHTML = '<div class="card"><div class="card-body"><p class="hint">No sentence material yet.</p></div></div>';
      return;
    }
    var idx = D.data.progress.zinIdx;
    if (idx >= list.length) {
      if (!D.data.done.zinnen) finishSection('zinnen');
      doneCard(box, 'Sentences done for today', 'daily', "See today's summary");
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
    card.innerHTML = '<div class="card-head"><span class="muted">Sentence ' + (idx + 1) + ' / ' + list.length +
      '</span><span class="muted">' + esc(sent.tag || '') + '</span></div>' +
      '<div class="card-body"><p class="prompt-ask">Tap the tiles to build this sentence in Dutch</p>' +
      '<div class="word-en" style="margin-top:4px">' + esc(sent.en) + '</div></div>';
    box.appendChild(card);

    // Answer area
    var ans = document.createElement('div');
    ans.className = 'chip-zone answer' + (Z.checked ? (Z.ok ? ' ok' : ' bad') : '');
    if (!Z.placed.length) {
      var ph = document.createElement('span');
      ph.className = 'chip-ph';
      ph.textContent = 'Build the sentence here';
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

    // Tile pool
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
      clr.textContent = 'Clear';
      clr.addEventListener('click', function () {
        Z.pool = Z.pool.concat(Z.placed);
        Z.placed = [];
        drawZin(box, list, idx);
      });
      var sub = document.createElement('button');
      sub.className = 'btn';
      sub.textContent = 'Submit';
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
        hint.textContent = 'Place every tile in the answer area to submit; tap a placed tile to take it back.';
        box.appendChild(hint);
      }
      return;
    }

    var res = document.createElement('div');
    res.className = 'card';
    res.innerHTML = '<div class="card-body"><p class="result ' + (Z.ok ? 'right' : 'wrong') +
      '" style="margin:0 0 8px">' + (Z.ok ? 'Correct word order' : 'Wrong - the correct order is') + '</p>' +
      '<div class="ex-nl" style="margin-top:0">' + esc(sent.nl) + '</div>' +
      '<div class="ex-en">' + esc(sent.en) + '</div></div>';
    box.appendChild(res);
    if (ttsOk()) {
      var sp = speakBtn(sent.nl, 'Listen again', true);
      sp.style.display = 'block';
      sp.style.margin = '0 auto 12px';
      box.appendChild(sp);
    }

    var next = document.createElement('button');
    next.className = 'btn block';
    next.textContent = (idx + 1 < list.length) ? 'Next sentence' : 'Finish the sentences section';
    next.addEventListener('click', function () {
      D.data.progress.zinIdx = idx + 1;
      D.save();
      Z.idx = -1;
      renderZinnen();
    });
    box.appendChild(next);
  }

  // ===================== Public interface =====================
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
    reset: function () { D.reset(); },
    // Called after switching profile: drop the cached data so the next read
    // picks up the newly active profile's storage key.
    reload: function () { D.data = null; }
  };
})();