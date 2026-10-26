/* 荷兰语 B1 备考助手 · Web 版
 *
 * 与桌面版(main.py / core/store.py / ui/woorden.py)功能对齐:
 *   看板就绪度、词汇三种练习(闪卡 / 双向选择 / 拼写)、进度统计。
 * 差异:
 *   - 进度存 localStorage(浏览器本地),不写 data/progress.json;
 *   - 朗读用浏览器 Web Speech API(nl-NL),替代 macOS `say`。
 */

(function () {
  'use strict';

  // ===================== 常量 =====================
  var WORDS = window.VOCAB || [];
  var ALL_THEMES = '全部主题';
  var RECENT_WINDOW = 20;    // 就绪度采样窗口(与 core/store.py 一致)
  var READY_THRESHOLD = 0.8; // 达标正确率
  var LS_KEY = 'dutch_b1_progress_v2';

  var SUBJECT_CARDS = [
    ['woorden', '词汇 Woordenschat', '主题化记忆 · 2000+ 目标', 'rate'],
    ['lezen', '阅读 Lezen', 'B1 短文理解', 'soon'],
    ['luisteren', '听力 Luisteren', 'B1 语音听辨', 'soon'],
    ['schrijven', '写作 Schrijven', '邮件 / 表单书写', 'soon'],
    ['spreken', '口语 Spreken', '情景对话应答', 'soon'],
    ['knm', '社会知识 KNM', '荷兰社会与文化', 'soon'],
    ['ona', '劳动市场 ONA', '职业导向成果', 'soon'],
    ['grammatica', '语法 Grammatica', '从句 / 时态 / 语序', 'soon']
  ];

  // ===================== 进度存储 =====================
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
      try { d = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { d = null; }
      if (!d || d.version !== 2 || !d.subjects) d = this.empty();
      if (!d.subjects.woorden) d.subjects.woorden = { answered: 0, correct: 0, recent: [] };
      if (!Array.isArray(d.mastered)) d.mastered = [];
      this.data = d;
      return d;
    },

    save: function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) {}
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

    /** 返回 {rate, ready, sampled}:最近窗口正确率 / 是否达标 / 样本数 */
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

  // ===================== 朗读(Web Speech API) =====================
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

  // ===================== 工具 =====================
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

  /** 转义为 HTML 文本:借 textContent→innerHTML,避免手写实体被工具链误处理 */
  function esc(s) {
    var d = document.createElement('div');
    d.textContent = (s == null ? '' : String(s));
    return d.innerHTML;
  }

  // ===================== 页面标题 =====================
  var TITLES = {
    dashboard: ['荷兰语 B1 备考看板', 'Inburgeringsexamen · 读 / 听 / 写 / 说 + KNM + ONA'],
    woorden: ['词汇 Woordenschat', '闪卡 / 双向选择 / 拼写 · 作答计入看板'],
    stats: ['学习统计', '进度保存在本机浏览器'],
    soon: ['内容开发中', '后续阶段开放']
  };

  function setHeader(route) {
    var t = TITLES[route] || TITLES.dashboard;
    $('page-title').textContent = t[0];
    $('page-sub').textContent = t[1];
    $('btn-back').hidden = (route === 'dashboard');
  }

  // ===================== 看板 =====================
  function renderDashboard() {
    var view = $('view');
    var ov = Store.readiness('woorden');
    var masteredCount = Store.data.mastered.length;

    var tip;
    if (ov.sampled === 0) {
      tip = '先从「词汇」开始:按主题过一遍闪卡,再做双向选择和拼写测验,为后续阅读 / 听力打底。目标词汇量 2000+。';
    } else if (!ov.ready) {
      tip = '继续巩固「词汇」,把最近 ' + RECENT_WINDOW + ' 题正确率提到 80% 以上即算达标;之后阅读、听力、KNM 模块会陆续开放。';
    } else {
      tip = '词汇已达标,基础扎实。后续阶段将开放阅读、听力、写作、口语、KNM 与 ONA 模块,可按看板逐科攻克。';
    }

    var html = '<div class="tip"><div class="tip-label">建议</div>' +
               '<p class="tip-text">' + esc(tip) + '</p></div><div class="subj-list">';

    SUBJECT_CARDS.forEach(function (c) {
      var route = c[0], name = c[1], sub = c[2], kind = c[3];
      var status, color;
      if (kind === 'rate') {
        var r = Store.readiness(route);
        color = statusColor(r.ready, r.sampled);
        status = r.sampled === 0
          ? '未开始 · 去练习建立基线'
          : '最近 ' + r.sampled + ' 题正确率 ' + Math.round(r.rate * 100) + '% · ' + (r.ready ? '已达标' : '练习中');
      } else {
        color = 'var(--muted)';
        status = '内容开发中(后续阶段开放)';
      }
      html += '<div class="subj ' + (kind === 'rate' ? 'clickable' : 'soon') + '" data-go="' +
              (kind === 'rate' ? route : 'soon') + '">' +
              '<div class="subj-main"><div class="subj-name">' + esc(name) + '</div>' +
              '<div class="subj-sub">' + esc(sub) + '</div>' +
              '<div class="subj-status" style="color:' + color + '">' + esc(status) + '</div></div>' +
              '<div class="subj-arrow">›</div></div>';
    });

    html += '</div><p class="foot-note">已掌握单词 ' + masteredCount + ' / ' + WORDS.length +
            ' · 词库来自 data/vocabulary.json</p>';

    view.innerHTML = html;
    view.querySelectorAll('[data-go]').forEach(function (el) {
      el.addEventListener('click', function () { navigate(el.getAttribute('data-go')); });
    });
  }

  // ===================== 占位页 =====================
  function renderSoon() {
    $('view').innerHTML =
      '<div class="card"><div class="card-body">' +
      '<div class="word-zh" style="margin-top:0">该科目内容开发中</div>' +
      '<p class="hint">按 DESIGN_B1.md 的 Roadmap,阅读 / 听力 / 写作 / 口语 / KNM / ONA 将分阶段上线。<br>' +
      '当前可先把「词汇」练到达标。</p>' +
      '</div></div>' +
      '<button class="btn block" id="soon-back">去练词汇</button>';
    $('soon-back').addEventListener('click', function () { navigate('woorden'); });
  }

  // ===================== 统计 =====================
  function renderStats() {
    var s = Store.data.subjects.woorden;
    var answered = s.answered || 0;
    var correct = s.correct || 0;
    var rate = answered ? Math.round(correct / answered * 100) : 0;
    var mastered = Store.data.mastered.length;
    var pct = WORDS.length ? Math.round(mastered / WORDS.length * 100) : 0;
    var r = Store.readiness('woorden');

    $('view').innerHTML =
      '<div class="stat-grid">' +
      '<div class="stat"><div class="stat-num">' + mastered + '</div><div class="stat-label">已掌握单词</div></div>' +
      '<div class="stat"><div class="stat-num">' + WORDS.length + '</div><div class="stat-label">词库总量</div></div>' +
      '<div class="stat"><div class="stat-num">' + answered + '</div><div class="stat-label">累计答题</div></div>' +
      '<div class="stat"><div class="stat-num">' + rate + '%</div><div class="stat-label">总体正确率</div></div>' +
      '</div>' +
      '<div class="card"><div class="card-head"><span>掌握进度</span><span class="muted">' + pct + '%</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="foot-note" style="margin-top:10px">就绪度:最近 ' + r.sampled + ' 题正确率 ' +
      Math.round(r.rate * 100) + '%,' + (r.ready ? '已达标' : '需最近 ' + RECENT_WINDOW + ' 题且 ≥80% 才达标') + '。</p>' +
      '</div>' +
      '<button class="btn red block" id="btn-reset">重置学习进度</button>' +
      '<p class="foot-note">进度保存在本机浏览器(localStorage),换设备或清缓存会丢失。' +
      (TTS.available ? '' : '<br>当前浏览器不支持语音朗读。') + '</p>';

    $('btn-reset').addEventListener('click', function () {
      if (window.confirm('确定清空已掌握单词与答题记录?')) {
        Store.reset();
        renderStats();
      }
    });
  }

  // ===================== 词汇练习 =====================
  var W = {
    theme: ALL_THEMES,
    mode: 'flash',     // flash / choice / spell
    pool: [],
    idx: 0,
    flipped: false,
    answered: false,
    dir: true,         // true = nl→zh
    opts: [],
    correct: '',
    picked: null
  };

  function renderWoorden() {
    var view = $('view');
    view.innerHTML = '';
    view.appendChild($('tpl-woorden').content.cloneNode(true));

    // 主题下拉
    var sel = $('theme-select');
    var list = [ALL_THEMES].concat(themes());
    list.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = (t === ALL_THEMES ? t : t) +
        (t === ALL_THEMES ? ' (' + WORDS.length + ')' : ' (' + wordsByTheme(t).length + ')');
      sel.appendChild(o);
    });
    sel.value = W.theme;
    sel.addEventListener('change', function () {
      W.theme = sel.value;
      reloadPool();
    });

    // 模式切换
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
      box.innerHTML = '<div class="card"><div class="card-body"><p class="hint">该主题暂无单词。</p></div></div>';
      return;
    }
    if (W.mode === 'flash') renderFlash(box);
    else if (W.mode === 'choice') renderChoice(box);
    else renderSpell(box);
  }

  // ---------- 闪卡 ----------
  function renderFlash(box) {
    var w = W.pool[W.idx];
    box.appendChild($('tpl-flash').content.cloneNode(true));

    $('flash-progress').textContent = progressText();
    var mastered = Store.isMastered(w.nl);
    $('flash-mastered').textContent = mastered ? '★ 已掌握' : '';
    $('flash-nl').textContent = w.nl;

    var speak = $('flash-speak');
    if (TTS.available) {
      speak.addEventListener('click', function (e) { e.stopPropagation(); TTS.speak(w.nl); });
    } else {
      speak.hidden = true;
    }

    var back = $('flash-back');
    back.hidden = !W.flipped;
    $('flash-hint').textContent = W.flipped ? '点击卡片收起' : '点击卡片翻面';
    if (W.flipped) {
      $('flash-zh').textContent = w.zh;
      $('flash-ex-nl').textContent = w.ex_nl || '';
      $('flash-ex-zh').textContent = w.ex_zh || '';
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
    mBtn.textContent = mastered ? '取消掌握' : '标记已掌握';
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

  // ---------- 双向选择 ----------
  function buildChoice(w) {
    W.dir = Math.random() < 0.5;
    var key = W.dir ? 'zh' : 'nl';
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
    var prompt = W.dir ? w.nl : w.zh;
    var ask = W.dir ? '选择对应的中文' : '选择对应的荷兰语';

    var head = document.createElement('div');
    head.className = 'card';
    head.innerHTML = '<div class="card-head"><span class="muted">' + progressText() + '</span></div>' +
                     '<div class="card-body"><p class="prompt-ask">' + ask + '</p>' +
                     '<div class="word-nl">' + esc(prompt) + '</div></div>';
    box.appendChild(head);

    if (W.dir && TTS.available) {
      var sp = document.createElement('button');
      sp.className = 'speak-btn';
      sp.style.display = 'block';
      sp.style.margin = '0 auto 12px';
      sp.textContent = '🔊 朗读';
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
                       '<div class="ex-zh">' + esc(w.ex_zh || '') + '</div>';
        box.appendChild(ex);
      }
      box.appendChild(nextBtn());
    }
  }

  // ---------- 拼写 ----------
  function renderSpell(box) {
    var w = W.pool[W.idx];
    box.innerHTML = '';

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><span class="muted">' + progressText() + '</span></div>' +
                     '<div class="card-body"><p class="prompt-ask">根据中文写出荷兰语</p>' +
                     '<div class="word-zh" style="margin-top:6px">' + esc(w.zh) + '</div></div>';
    box.appendChild(card);

    var input = document.createElement('input');
    input.className = 'spell-input';
    input.type = 'text';
    // 关闭移动端自动纠错/首字母大写,否则荷兰语单词常被输入法改掉
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.placeholder = '输入荷兰语';
    box.appendChild(input);

    var res = document.createElement('p');
    res.className = 'result';
    box.appendChild(res);

    var row = document.createElement('div');
    row.className = 'row-btns';
    var submit = document.createElement('button');
    submit.className = 'btn';
    submit.textContent = '提交';
    var skip = document.createElement('button');
    skip.className = 'btn grey';
    skip.textContent = '跳过 / 下一题';
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
      res.textContent = ok ? '✓ 正确!' : '✗ 正确答案:' + w.nl;
      input.blur();
      if (TTS.available) TTS.speak(w.nl);
      if (w.ex_nl) {
        var ex = document.createElement('div');
        ex.className = 'card';
        ex.innerHTML = '<div class="ex-nl" style="margin-top:0">' + esc(w.ex_nl) + '</div>' +
                       '<div class="ex-zh">' + esc(w.ex_zh || '') + '</div>';
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
    b.textContent = '下一题';
    b.addEventListener('click', nextQA);
    return b;
  }

  function nextQA() {
    W.idx = (W.idx + 1) % W.pool.length;
    W.answered = false;
    renderPractice();
  }

  // ===================== 路由 =====================
  var current = 'dashboard';

  function navigate(route) {
    current = route;
    setHeader(route === 'soon' ? 'soon' : route);
    if (route === 'dashboard') renderDashboard();
    else if (route === 'woorden') renderWoorden();
    else if (route === 'stats') renderStats();
    else renderSoon();

    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-route') === route);
    });
    window.scrollTo(0, 0);
    // 用 hash 记路由,手机端系统返回手势/返回键才能退回上一页
    if (('#' + route) !== location.hash) {
      location.hash = route;
    }
  }

  // ===================== 启动 =====================
  function init() {
    Store.load();

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { navigate(t.getAttribute('data-route')); });
    });
    $('btn-back').addEventListener('click', function () { navigate('dashboard'); });

    window.addEventListener('hashchange', function () {
      var r = (location.hash || '#dashboard').slice(1) || 'dashboard';
      if (r !== current) navigate(r);
    });

    if (TTS.available) {
      TTS.pickVoice();
      // Safari/Chrome 的语音列表是异步加载的,事件里再挑一次
      window.speechSynthesis.onvoiceschanged = function () { TTS.pickVoice(); };
    }

    var start = (location.hash || '#dashboard').slice(1) || 'dashboard';
    navigate(start);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();