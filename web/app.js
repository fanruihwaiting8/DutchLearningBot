/* Dutch B1 Exam Trainer - Web edition
 *
 * Feature parity with the desktop app (main.py / core/store.py / ui/woorden.py):
 *   dashboard readiness, three vocabulary drills (flashcards / choice / spelling), stats.
 * Differences:
 *   - progress is stored in localStorage (browser local), not data/progress.json;
 *   - speech uses the browser Web Speech API (nl-NL) instead of the macOS `say` command.
 */

(function () {
  'use strict';

  // ===================== Constants =====================
  var WORDS = window.VOCAB || [];
  var ALL_THEMES = 'All themes';
  var RECENT_WINDOW = 20;    // readiness sampling window (same as core/store.py)
  var READY_THRESHOLD = 0.8; // accuracy needed to pass
  var LS_KEY = 'dutch_b1_progress_v2';
  var USERS_KEY = 'dutch_b1_users_v1';
  var DAILY_KEY = 'dutch_b1_daily_v1'; // owned by daily.js, listed here for migration
  var MAX_USERS = 8;

  // [readiness/route key, name, subtitle, 'rate'|'soon', click route (defaults to key)]
  var SUBJECT_CARDS = [
    ['woorden', 'Vocabulary Woordenschat', 'Theme-based memorisation - 2000+ target', 'rate'],
    ['lezen', 'Reading Lezen', 'B1 passage comprehension - 1 per day', 'rate', 'daily-lezen'],
    ['luisteren', 'Listening Luisteren', 'B1 audio discrimination', 'soon'],
    ['schrijven', 'Writing Schrijven', 'Emails / forms', 'soon'],
    ['spreken', 'Speaking Spreken', 'Situational dialogue responses', 'soon'],
    ['knm', 'Society KNM', 'Dutch society and culture', 'soon'],
    ['ona', 'Labour market ONA', 'Career-oriented outcomes', 'soon'],
    ['grammatica', 'Grammar Grammatica', 'Clauses / tenses / word order', 'soon']
  ];

  // ===================== Profiles (multi-user) =====================
  /* Several people can share one browser: every profile keeps its own progress.
     Storage layout:
       dutch_b1_users_v1                  -> { version, list: [{id, name}], currentId }
       dutch_b1_progress_v2__<id>         -> that profile's overall progress
       dutch_b1_daily_v1__<id>            -> that profile's daily progress
     Legacy single-user keys (without the __<id> suffix) are migrated into the
     first profile on first load, so existing progress is never lost. */
  var Users = {
    data: null,

    newId: function () {
      return 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    },

    load: function () {
      var d = null;
      try { d = JSON.parse(localStorage.getItem(USERS_KEY) || 'null'); } catch (e) { d = null; }
      if (!d || d.version !== 1 || !Array.isArray(d.list) || !d.list.length) {
        d = this.bootstrap();
      }
      if (!this.find(d.currentId, d.list)) d.currentId = d.list[0].id;
      this.data = d;
      return d;
    },

    /** First run: create one profile and adopt any legacy single-user progress */
    bootstrap: function () {
      var id = this.newId();
      var d = { version: 1, list: [{ id: id, name: 'Me' }], currentId: id };
      [LS_KEY, DAILY_KEY].forEach(function (base) {
        try {
          var old = localStorage.getItem(base);
          if (old != null && localStorage.getItem(base + '__' + id) == null) {
            localStorage.setItem(base + '__' + id, old);
            localStorage.removeItem(base);
          }
        } catch (e) {}
      });
      try { localStorage.setItem(USERS_KEY, JSON.stringify(d)); } catch (e) {}
      return d;
    },

    save: function () {
      try { localStorage.setItem(USERS_KEY, JSON.stringify(this.data)); } catch (e) {}
    },

    find: function (id, list) {
      list = list || (this.data ? this.data.list : []);
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },

    all: function () { return this.data.list.slice(); },
    currentId: function () { return this.data.currentId; },
    current: function () { return this.find(this.data.currentId) || this.data.list[0]; },
    currentName: function () { var u = this.current(); return u ? u.name : 'Me'; },

    /** Namespaced storage key for the active profile */
    key: function (base) { return base + '__' + this.data.currentId; },

    /** Returns the new id, or '' when the name is invalid / the limit is reached */
    add: function (name) {
      name = this.clean(name);
      if (!name || this.data.list.length >= MAX_USERS) return '';
      var id = this.newId();
      this.data.list.push({ id: id, name: name });
      this.data.currentId = id;
      this.save();
      return id;
    },

    rename: function (id, name) {
      name = this.clean(name);
      var u = this.find(id);
      if (!u || !name) return false;
      u.name = name;
      this.save();
      return true;
    },

    /** Removing a profile also drops its progress; the last profile is kept */
    remove: function (id) {
      if (this.data.list.length <= 1) return false;
      var i = -1;
      for (var k = 0; k < this.data.list.length; k++) if (this.data.list[k].id === id) i = k;
      if (i < 0) return false;
      this.data.list.splice(i, 1);
      [LS_KEY, DAILY_KEY].forEach(function (base) {
        try { localStorage.removeItem(base + '__' + id); } catch (e) {}
      });
      if (this.data.currentId === id) this.data.currentId = this.data.list[0].id;
      this.save();
      return true;
    },

    select: function (id) {
      if (!this.find(id) || id === this.data.currentId) return false;
      this.data.currentId = id;
      this.save();
      return true;
    },

    clean: function (name) {
      return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 20);
    },

    /** Small headline numbers for a profile, read straight from its own keys */
    statsOf: function (id) {
      var out = { mastered: 0, answered: 0, streak: 0 };
      try {
        var p = JSON.parse(localStorage.getItem(LS_KEY + '__' + id) || 'null');
        if (p) {
          out.mastered = (p.mastered || []).length;
          var w = p.subjects && p.subjects.woorden;
          out.answered = w ? (w.answered || 0) : 0;
        }
      } catch (e) {}
      try {
        var d = JSON.parse(localStorage.getItem(DAILY_KEY + '__' + id) || 'null');
        if (d) out.streak = d.streak || 0;
      } catch (e) {}
      return out;
    }
  };

  // ===================== Progress store =====================
  var Store = {
    data: null,

    empty: function () {
      return {
        version: 2,
        mastered: [],
        subjects: { woorden: { answered: 0, correct: 0, recent: [] } },
        tasks: {}
      };
    },

    load: function () {
      var d = null;
      try { d = JSON.parse(localStorage.getItem(Users.key(LS_KEY)) || 'null'); } catch (e) { d = null; }
      if (!d || d.version !== 2 || !d.subjects) d = this.empty();
      if (!d.subjects.woorden) d.subjects.woorden = { answered: 0, correct: 0, recent: [] };
      if (!Array.isArray(d.mastered)) d.mastered = [];
      this.data = d;
      return d;
    },

    save: function () {
      try { localStorage.setItem(Users.key(LS_KEY), JSON.stringify(this.data)); } catch (e) {}
    },

    reset: function () {
      this.data = this.empty();
      this.save();
    },

    recordAnswer: function (subject, correct) {
      var s = this.data.subjects[subject];
      if (!s) { s = this.data.subjects[subject] = { answered: 0, correct: 0, recent: [] }; }
      s.answered += 1;
      if (correct) s.correct += 1;
      s.recent.push(correct ? 1 : 0);
      if (s.recent.length > RECENT_WINDOW) s.recent = s.recent.slice(-RECENT_WINDOW);
      this.save();
    },

    /** Returns {rate, ready, sampled}: recent-window accuracy / passed or not / sample size */
    readiness: function (subject) {
      var s = this.data.subjects[subject];
      if (!s || !s.recent.length) return { rate: 0, ready: false, sampled: 0 };
      var sampled = s.recent.length;
      var sum = s.recent.reduce(function (a, b) { return a + b; }, 0);
      var rate = sum / sampled;
      return { rate: rate, ready: sampled >= RECENT_WINDOW && rate >= READY_THRESHOLD, sampled: sampled };
    },

    isMastered: function (nl) { return this.data.mastered.indexOf(nl) >= 0; },

    toggleMastered: function (nl) {
      var i = this.data.mastered.indexOf(nl);
      if (i >= 0) this.data.mastered.splice(i, 1);
      else this.data.mastered.push(nl);
      this.save();
      return i < 0;
    }
  };

  // ===================== Speech (Web Speech API) =====================
  var TTS = {
    available: typeof window.speechSynthesis !== 'undefined',
    voice: null,

    pickVoice: function () {
      if (!this.available) return;
      var vs = window.speechSynthesis.getVoices() || [];
      for (var i = 0; i < vs.length; i++) {
        if (/^nl/i.test(vs[i].lang)) { this.voice = vs[i]; return; }
      }
    },

    speak: function (text) {
      if (!this.available || !text) return;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'nl-NL';
        u.rate = 0.9;
        if (this.voice) u.voice = this.voice;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }
  };

  // ===================== Helpers =====================
  function $(id) { return document.getElementById(id); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function themes() {
    var seen = [];
    WORDS.forEach(function (w) {
      if (w.cat && seen.indexOf(w.cat) < 0) seen.push(w.cat);
    });
    return seen.sort();
  }

  function wordsByTheme(theme) {
    if (!theme || theme === ALL_THEMES) return WORDS.slice();
    return WORDS.filter(function (w) { return w.cat === theme; });
  }

  function statusColor(ready, sampled) {
    if (ready) return 'var(--ok)';
    if (sampled > 0) return 'var(--warn)';
    return 'var(--muted)';
  }

  /** Escape as HTML text: go through textContent -> innerHTML to avoid hand-written entities */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = (s == null ? '' : String(s));
    return d.innerHTML;
  }

  // ===================== Page titles =====================
  var TITLES = {
    dashboard: ['Dutch B1 Exam Dashboard', 'Inburgeringsexamen - read / listen / write / speak + KNM + ONA'],
    daily: ['Today', 'A fixed daily workload - words + reading + sentences'],
    'daily-words': ['Today: Words', '15 new words + 15 review words'],
    'daily-lezen': ['Today: Reading', '1 passage + 3 comprehension questions'],
    'daily-zinnen': ['Today: Sentences', 'Word-order rebuild - 8 sentences'],
    woorden: ['Vocabulary Woordenschat', 'Flashcards / choice / spelling - answers count on the dashboard'],
    stats: ['Statistics', 'Progress is stored in this browser'],
    users: ['Profiles', 'Switch profile - each one keeps its own progress'],
    soon: ['In development', 'Coming in a later stage']
  };

  function setHeader(route) {
    var t = TITLES[route] || TITLES.dashboard;
    $('page-title').textContent = t[0];
    $('page-sub').textContent = t[1];
    $('btn-back').hidden = (route === 'dashboard' || route === 'daily');
  }

  // ===================== Dashboard =====================
  function renderDashboard() {
    var view = $('view');
    var ov = Store.readiness('woorden');
    var masteredCount = Store.data.mastered.length;

    var tip;
    if (ov.sampled === 0) {
      tip = 'Start each day by finishing "Today": 15 new words + 15 review words + 1 reading passage + 8 word-order sentences, about 20 minutes. Then drill freely in "Words" if you still have energy.';
    } else if (!ov.ready) {
      tip = 'Keep working on "Words": once your accuracy over the last ' + RECENT_WINDOW + ' questions is above 80% the subject counts as passed. Reading, listening and KNM modules will open up afterwards.';
    } else {
      tip = 'Vocabulary passed - a solid base. Later stages will add reading, listening, writing, speaking, KNM and ONA so you can clear the dashboard subject by subject.';
    }

    // Today's progress card: see at a glance how much is left for today
    var html = '';
    if (window.Daily) {
      var dy = window.Daily.summary();
      html += '<div class="card clickable" data-go="daily">' +
        '<div class="card-head"><span>Today' + (dy.allDone ? ' - done' : '') + '</span>' +
        '<span class="muted">' + dy.pct + '%</span></div>' +
        '<div class="bar"><i style="width:' + dy.pct + '%"></i></div>' +
        '<p class="foot-note" style="margin-top:10px">' +
        (dy.allDone ? 'Words, reading and sentences are all finished for today' : 'Today ' + dy.sections + ' / 3 sections done - ' + dy.got + ' / ' + dy.total + ' items') +
        (dy.streak > 0 ? ' - ' + dy.streak + '-day streak' : '') + '</p></div>';
    }

    html += '<div class="tip"><div class="tip-label">Tip</div>' +
            '<p class="tip-text">' + esc(tip) + '</p></div><div class="subj-list">';

    SUBJECT_CARDS.forEach(function (c) {
      var route = c[0], name = c[1], sub = c[2], kind = c[3];
      var status, color;
      if (kind === 'rate') {
        var r = Store.readiness(route);
        color = statusColor(r.ready, r.sampled);
        status = r.sampled === 0
          ? 'Not started - practise to set a baseline'
          : 'Accuracy ' + Math.round(r.rate * 100) + '% over the last ' + r.sampled + ' questions - ' + (r.ready ? 'passed' : 'in progress');
      } else {
        color = 'var(--muted)';
        status = 'In development (coming in a later stage)';
      }
      html += '<div class="subj ' + (kind === 'rate' ? 'clickable' : 'soon') + '" data-go="' +
              (kind === 'rate' ? (c[4] || route) : 'soon') + '">' +
              '<div class="subj-main"><div class="subj-name">' + esc(name) + '</div>' +
              '<div class="subj-sub">' + esc(sub) + '</div>' +
              '<div class="subj-status" style="color:' + color + '">' + esc(status) + '</div></div>' +
              '<div class="subj-arrow">&rsaquo;</div></div>';
    });

    html += '</div><p class="foot-note">Mastered words ' + masteredCount + ' / ' + WORDS.length +
            ' - word list from data/vocabulary.json</p>';

    view.innerHTML = html;
    view.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () { navigate(el.getAttribute('data-go')); });
    });
  }

  // ===================== Placeholder page =====================
  function renderSoon() {
    $('view').innerHTML =
      '<div class="card"><div class="card-body">' +
      '<div class="word-en" style="margin-top:0">This subject is still in development</div>' +
      '<p class="hint">Following the roadmap in DESIGN_B1.md, reading / listening / writing / speaking / KNM / ONA will ship in stages.<br>' +
      'For now, practise "Words" until you pass.</p>' +
      '</div></div>' +
      '<button class="btn block" id="soon-back">Practise words</button>';
    $('soon-back').addEventListener('click', function () { navigate('woorden'); });
  }

  // ===================== Statistics =====================
  function renderStats() {
    var s = Store.data.subjects.woorden;
    var answered = s.answered || 0;
    var correct = s.correct || 0;
    var rate = answered ? Math.round(correct / answered * 100) : 0;
    var mastered = Store.data.mastered.length;
    var pct = WORDS.length ? Math.round(mastered / WORDS.length * 100) : 0;
    var r = Store.readiness('woorden');
    var dy = window.Daily ? window.Daily.summary() : null;

    $('view').innerHTML =
      '<div class="stat-grid">' +
      '<div class="stat"><div class="stat-num">' + mastered + '</div><div class="stat-label">Mastered words</div></div>' +
      '<div class="stat"><div class="stat-num">' + WORDS.length + '</div><div class="stat-label">Words in list</div></div>' +
      '<div class="stat"><div class="stat-num">' + answered + '</div><div class="stat-label">Questions answered</div></div>' +
      '<div class="stat"><div class="stat-num">' + rate + '%</div><div class="stat-label">Overall accuracy</div></div>' +
      (dy ? '<div class="stat"><div class="stat-num">' + dy.streak + '</div><div class="stat-label">Day streak</div></div>' +
            '<div class="stat"><div class="stat-num">' + dy.pct + '%</div><div class="stat-label">Today completed</div></div>' : '') +
      '</div>' +
      '<div class="card"><div class="card-head"><span>Mastery progress</span><span class="muted">' + pct + '%</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="foot-note" style="margin-top:10px">Readiness: accuracy ' +
      Math.round(r.rate * 100) + '% over the last ' + r.sampled + ' questions. ' +
      (r.ready ? 'Passed.' : 'You need ' + RECENT_WINDOW + ' recent questions at 80% or more to pass.') + '</p>' +
      '</div>' +
      '<button class="btn red block" id="btn-reset">Reset progress</button>' +
      '<p class="foot-note">Profile "' + esc(Users.currentName()) + '" - progress is stored in this browser (localStorage); it is lost when you switch devices or clear the cache.' +
      (TTS.available ? '' : '<br>This browser does not support speech synthesis.') + '</p>';

    $('btn-reset').addEventListener('click', function () {
      if (window.confirm('Clear mastered words, answer history and daily streak of profile "' + Users.currentName() + '"?')) {
        Store.reset();
        if (window.Daily) window.Daily.reset();
        renderStats();
      }
    });
  }

  // ===================== Vocabulary practice =====================
  var W = {
    theme: ALL_THEMES,
    mode: 'flash',     // flash / choice / spell
    pool: [],
    idx: 0,
    flipped: false,
    answered: false,
    dir: true,         // true = nl -> en
    opts: [],
    correct: '',
    picked: null
  };

  function renderWoorden() {
    var view = $('view');
    view.innerHTML = '';
    view.appendChild($('tpl-woorden').content.cloneNode(true));

    // Theme dropdown
    var sel = $('theme-select');
    var list = [ALL_THEMES].concat(themes());
    list.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = t +
        (t === ALL_THEMES ? ' (' + WORDS.length + ')' : ' (' + wordsByTheme(t).length + ')');
      sel.appendChild(o);
    });
    sel.value = W.theme;
    sel.addEventListener('change', function () {
      W.theme = sel.value;
      reloadPool();
    });

    // Mode switch
    $('mode-seg').querySelectorAll('.seg-btn').forEach(function (b) {
      if (b.getAttribute('data-mode') === W.mode) b.classList.add('active');
      b.addEventListener('click', function () {
        W.mode = b.getAttribute('data-mode');
        $('mode-seg').querySelectorAll('.seg-btn').forEach(function (x) {
          x.classList.toggle('active', x === b);
        });
        W.idx = 0; W.flipped = false; W.answered = false;
        renderPractice();
      });
    });

    reloadPool();
  }

  function reloadPool() {
    W.pool = shuffle(wordsByTheme(W.theme));
    W.idx = 0; W.flipped = false; W.answered = false;
    renderPractice();
  }

  function progressText() { return (W.idx + 1) + ' / ' + W.pool.length; }

  function renderPractice() {
    var box = $('practice');
    if (!box) return;
    box.innerHTML = '';
    if (!W.pool.length) {
      box.innerHTML = '<div class="card"><div class="card-body"><p class="hint">No words in this theme yet.</p></div></div>';
      return;
    }
    if (W.mode === 'flash') renderFlash(box);
    else if (W.mode === 'choice') renderChoice(box);
    else renderSpell(box);
  }

  // ---------- Flashcards ----------
  function renderFlash(box) {
    var w = W.pool[W.idx];
    box.appendChild($('tpl-flash').content.cloneNode(true));

    $('flash-progress').textContent = progressText();
    var mastered = Store.isMastered(w.nl);
    $('flash-mastered').textContent = mastered ? '* Mastered' : '';
    $('flash-nl').textContent = w.nl;

    var speak = $('flash-speak');
    if (TTS.available) {
      speak.addEventListener('click', function (e) { e.stopPropagation(); TTS.speak(w.nl); });
    } else {
      speak.hidden = true;
    }

    var back = $('flash-back');
    back.hidden = !W.flipped;
    $('flash-hint').textContent = W.flipped ? 'Tap the card to hide' : 'Tap the card to flip';
    if (W.flipped) {
      $('flash-en').textContent = w.en;
      $('flash-ex-nl').textContent = w.ex_nl || '';
      $('flash-ex-en').textContent = w.ex_en || '';
      var se = $('flash-speak-ex');
      if (w.ex_nl && TTS.available) {
        se.hidden = false;
        se.addEventListener('click', function (e) { e.stopPropagation(); TTS.speak(w.ex_nl); });
      }
    }

    $('flash-card').addEventListener('click', function () {
      W.flipped = !W.flipped;
      renderPractice();
    });

    var mBtn = $('flash-master');
    mBtn.textContent = mastered ? 'Unmark' : 'Mark as mastered';
    mBtn.className = 'btn ' + (mastered ? 'red' : 'green');
    mBtn.addEventListener('click', function () {
      Store.toggleMastered(w.nl);
      renderPractice();
    });

    $('flash-prev').addEventListener('click', function () {
      W.idx = (W.idx - 1 + W.pool.length) % W.pool.length;
      W.flipped = false;
      renderPractice();
    });
    $('flash-next').addEventListener('click', function () {
      W.idx = (W.idx + 1) % W.pool.length;
      W.flipped = false;
      renderPractice();
    });
  }

  // ---------- Two-way multiple choice ----------
  function buildChoice(w) {
    W.dir = Math.random() < 0.5;
    var key = W.dir ? 'en' : 'nl';
    var correct = w[key];
    var others = WORDS.filter(function (x) { return x[key] !== correct; })
                      .map(function (x) { return x[key]; });
    shuffle(others);
    W.opts = shuffle(others.slice(0, 3).concat([correct]));
    W.correct = correct;
    W.picked = null;
  }

  function renderChoice(box) {
    var w = W.pool[W.idx];
    if (!W.answered) buildChoice(w);
    drawChoice(box, w);
  }

  function drawChoice(box, w) {
    box.innerHTML = '';
    var prompt = W.dir ? w.nl : w.en;
    var ask = W.dir ? 'Pick the matching English' : 'Pick the matching Dutch';

    var head = document.createElement('div');
    head.className = 'card';
    head.innerHTML = '<div class="card-head"><span class="muted">' + progressText() +'</span></div>' +
                     '<div class="card-body"><p class="prompt-ask">' + ask + '</p>' +
                     '<div class="word-nl">' + esc(prompt) + '</div></div>';
    box.appendChild(head);

    if (W.dir && TTS.available) {
      var sp = document.createElement('button');
      sp.className = 'speak-btn';
      sp.style.display = 'block';
      sp.style.margin = '0 auto 12px';
      sp.textContent = 'Listen';
      sp.addEventListener('click', function () { TTS.speak(w.nl); });
      box.appendChild(sp);
    }

    W.opts.forEach(function (opt) {
      var b = document.createElement('button');
      b.className = 'opt';
      b.textContent = opt;
      if (W.answered) {
        if (opt === W.correct) b.classList.add('right');
        else if (opt === W.picked) b.classList.add('wrong');
      }
      b.addEventListener('click', function () {
        if (W.answered) return;
        W.answered = true;
        W.picked = opt;
        Store.recordAnswer('woorden', opt === W.correct);
        drawChoice(box, w);
      });
      box.appendChild(b);
    });

    if (W.answered) {
      if (w.ex_nl) {
        var ex = document.createElement('div');
        ex.className = 'card';
        ex.innerHTML = '<div class="ex-nl" style="margin-top:0">' + esc(w.ex_nl) + '</div>' +
                       '<div class="ex-en">' + esc(w.ex_en || '') + '</div>';
        box.appendChild(ex);
      }
      box.appendChild(nextBtn());
    }
  }

  // ---------- Spelling ----------
  function renderSpell(box) {
    var w = W.pool[W.idx];
    box.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><span class="muted">' + progressText() + '</span></div>' +
                     '<div class="card-body"><p class="prompt-ask">Write the Dutch word for this meaning</p>' +
                     '<div class="word-en" style="margin-top:6px">' + esc(w.en) + '</div></div>';
    box.appendChild(card);

    var input = document.createElement('input');
    input.className = 'spell-input';
    input.type = 'text';
    // Turn off mobile autocorrect/capitalisation, otherwise Dutch words get rewritten
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.placeholder = 'Type the Dutch word';
    box.appendChild(input);

    var res = document.createElement('p');
    res.className = 'result';
    box.appendChild(res);

    var row = document.createElement('div');
    row.className = 'row-btns';
    var submit = document.createElement('button');
    submit.className = 'btn';
    submit.textContent = 'Submit';
    var skip = document.createElement('button');
    skip.className = 'btn grey';
    skip.textContent = 'Skip / next';
    skip.addEventListener('click', nextQA);
    row.appendChild(submit);
    row.appendChild(skip);
    box.appendChild(row);

    function check() {
      if (W.answered) return;
      var ok = input.value.trim().toLowerCase() === String(w.nl).trim().toLowerCase();
      W.answered = true;
      Store.recordAnswer('woorden', ok);
      res.className = 'result ' + (ok ? 'right' : 'wrong');
      res.textContent = ok ? 'Correct!' : 'Correct answer: ' + w.nl;
      input.blur();
      if (TTS.available) TTS.speak(w.nl);
      if (w.ex_nl) {
        var ex = document.createElement('div');
        ex.className = 'card';
        ex.innerHTML = '<div class="ex-nl" style="margin-top:0">' + esc(w.ex_nl) + '</div>' +
                       '<div class="ex-en">' + esc(w.ex_en || '') + '</div>';
        box.appendChild(ex);
      }
      box.appendChild(nextBtn());
    }

    submit.addEventListener('click', check);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); check(); }
    });
  }

  function nextBtn() {
    var b = document.createElement('button');
    b.className = 'btn block';
    b.textContent = 'Next';
    b.addEventListener('click', nextQA);
    return b;
  }

  function nextQA() {
    W.idx = (W.idx + 1) % W.pool.length;
    W.answered = false;
    renderPractice();
  }

  // ===================== Profile page =====================
  /** Re-read every store from the keys of the now-active profile */
  function applyProfile() {
    Store.load();
    if (window.Daily && window.Daily.reload) window.Daily.reload();
    updateUserBtn();
  }

  function switchTo(id) {
    if (!Users.select(id)) return;
    applyProfile();
    navigate('dashboard');
  }

  function renderUsers() {
    var view = $('view');
    var list = Users.all();
    var cur = Users.currentId();

    var rows = list.map(function (u) {
      var s = Users.statsOf(u.id);
      return '<div class="user-row' + (u.id === cur ? ' current' : '') + '" data-id="' + esc(u.id) + '">' +
        '<button class="user-pick" data-act="pick" data-id="' + esc(u.id) + '">' +
        '<span class="user-name">' + esc(u.name) + (u.id === cur ? ' <span class="user-tag">active</span>' : '') + '</span>' +
        '<span class="user-meta">' + s.mastered + ' mastered - ' + s.answered + ' answered - ' + s.streak + ' day streak</span>' +
        '</button>' +
        '<span class="user-acts">' +
        '<button class="btn tiny" data-act="rename" data-id="' + esc(u.id) + '">Rename</button>' +
        (list.length > 1 ? '<button class="btn tiny red" data-act="remove" data-id="' + esc(u.id) + '">Delete</button>' : '') +
        '</span>' +
        '</div>';
    }).join('');

    view.innerHTML =
      '<div class="card"><div class="card-head"><span>Profiles</span>' +
      '<span class="muted">' + list.length + '/' + MAX_USERS + '</span></div>' +
      '<div class="user-list">' + rows + '</div>' +
      '<p class="foot-note">Tap a profile to switch. Every profile keeps its own words, answer history and day streak in this browser.</p>' +
      '</div>' +
      (list.length < MAX_USERS
        ? '<div class="card"><div class="card-head"><span>Add a profile</span></div>' +
          '<div class="user-add"><input id="new-user" class="input" type="text" maxlength="20" placeholder="Name" autocomplete="off">' +
          '<button class="btn primary" id="btn-add-user">Add</button></div>' +
          '<p class="foot-note">No password - the name only separates progress on this device.</p></div>'
        : '<p class="foot-note">Profile limit reached. Delete one to add another.</p>');

    view.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id');
        var act = b.getAttribute('data-act');
        if (act === 'pick') {
          switchTo(id);
        } else if (act === 'rename') {
          var u = Users.find(id);
          var name = window.prompt('New name', u ? u.name : '');
          if (name != null && Users.rename(id, name)) { updateUserBtn(); renderUsers(); }
        } else if (act === 'remove') {
          var v = Users.find(id);
          if (window.confirm('Delete "' + (v ? v.name : '') + '" and all of its progress?')) {
            var wasCurrent = (id === Users.currentId());
            if (Users.remove(id)) {
              if (wasCurrent) applyProfile();
              renderUsers();
            }
          }
        }
      });
    });

    var addBtn = $('btn-add-user');
    if (addBtn) {
      var submit = function () {
        var input = $('new-user');
        var id = Users.add(input.value);
        if (!id) { input.focus(); return; }
        switchTo(id);
      };
      addBtn.addEventListener('click', submit);
      $('new-user').addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') submit();
      });
    }
  }

  function updateUserBtn() {
    var b = $('btn-user');
    if (!b) return;
    var name = Users.currentName();
    b.textContent = name.slice(0, 1).toUpperCase();
    b.title = 'Profile: ' + name;
    b.setAttribute('aria-label', 'Profile: ' + name);
  }

  // ===================== Routing =====================
  var current = 'dashboard';

  function navigate(route) {
    current = route;
    setHeader(route === 'soon' ? 'soon' : route);
    if (route === 'dashboard') renderDashboard();
    else if (route === 'woorden') renderWoorden();
    else if (route === 'stats') renderStats();
    else if (route === 'users') renderUsers();
    else if (route.indexOf('daily') === 0 && window.Daily) window.Daily.route(route);
    else renderSoon();

    document.querySelectorAll('.tab').forEach(function (t) {
      var r = t.getAttribute('data-route');
      // Sub-pages such as daily-words must still highlight the "Today" tab
      t.classList.toggle('active', r === route || (r === 'daily' && route.indexOf('daily') === 0));
    });
    window.scrollTo(0, 0);
    // Keep the route in the hash so the system back gesture/button works on mobile
    if (('#' + route) !== location.hash) {
      location.hash = route;
    }
  }

  // ===================== Bootstrap =====================
  function init() {
    Users.load();
    Store.load();

    // Shared with daily.js: progress store, speech, escaping and routing
    window.AppBridge = {
      Store: Store,
      Users: Users,
      TTS: TTS,
      esc: esc,
      shuffle: shuffle,
      navigate: navigate
    };

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { navigate(t.getAttribute('data-route')); });
    });
    $('btn-back').addEventListener('click', function () {
      navigate(current.indexOf('daily-') === 0 ? 'daily' : 'dashboard');
    });
    $('btn-user').addEventListener('click', function () { navigate('users'); });
    updateUserBtn();

    window.addEventListener('hashchange', function () {
      var r = (location.hash || '#daily').slice(1) || 'daily';
      if (r !== current) navigate(r);
    });

    if (TTS.available) {
      TTS.pickVoice();
      // Safari/Chrome load the voice list asynchronously, so pick again on the event
      window.speechSynthesis.onvoiceschanged = function () { TTS.pickVoice(); };
    }

    // Land on "Today" by default so the app opens straight into practice
    var start = (location.hash || '#daily').slice(1) || 'daily';
    navigate(start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();