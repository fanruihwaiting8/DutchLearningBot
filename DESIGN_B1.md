# Dutch B1 Integration Exam App - a design derived from the exam standard

> Goal: pass the integration exam under the **Wet inburgering (B1 route)**.
> Method: first break down the official exam standard, then turn every "what is tested"
> into a matching "what the app drills".

---

## 1. Official structure of the B1 integration exam (what is tested)

The integration exam (B1 route) has 6 mandatory parts: the first four are CEFR B1 language skills, the last two are the society and labour-market modules.

| No. | Subject | Dutch | Level | Exam format |
|---|---|---|---|---|
| 1 | Reading | Lezen | B1 | Computer based, read a text and answer multiple choice |
| 2 | Listening | Luisteren | B1 | Computer based, listen to audio and answer multiple choice |
| 3 | Writing | Schrijven | B1 | Computer based, fill in forms / write emails and texts |
| 4 | Speaking | Spreken | B1 | Computer based, record an answer after a prompt |
| 5 | Knowledge of Dutch society | KNM | - | Computer based, images/clips with multiple choice |
| 6 | Labour market orientation | ONA / MAP | - | Portfolio + closing interview (not multiple choice) |

**Key quantitative targets of the B1 standard (the basis for sizing the content):**
- Vocabulary: roughly **2000-3000** high-frequency words (A2 is about 1000, B1 doubles it).
- Grammar: subordinate clause word order, perfect/past tense, modal verbs, separable verbs, conjunctions, comparatives, relative clauses, the `er` constructions.
- Must be able to understand and produce: emails, text messages, forms, notes, complaints/requests and everyday administrative communication.

---

## 2. Mapping backwards: exam requirement -> app module

Every exam subject maps to one app module, with task types kept close to the real exam.

### Module 1 - Reading / Lezen (B1)
- **Exam requirement**: understand letters, emails, adverts, instructions and short news items; answer multiple choice, true/false and matching questions.
- **App features**:
  - A themed reading library (health / work / housing / education / government affairs), 100-250 words per passage.
  - 3-5 multiple choice questions per passage, plus tap-a-word lookup.
  - A timed mode that mimics the pace of the computer-based exam.
- **Data**: `data/lezen.json` (passage + questions + vocabulary notes).

### Module 2 - Listening / Luisteren (B1)
- **Exam requirement**: understand dialogues, voicemail, public announcements and news, then answer multiple choice.
- **App features**:
  - Read the listening scripts with the system Dutch TTS (macOS `say -v Xander/Claire/Ellen`).
  - Replay freely, adjust speed; answer afterwards with the transcript available for review.
- **Data**: `data/luisteren.json` (script + questions). Audio is produced by TTS at runtime, so no audio files need to be bundled.

### Module 3 - Writing / Schrijven (B1)
- **Exam requirement**: fill in forms, write emails and text messages, respond in writing to a situation.
- **App features**:
  - Situational writing tasks (asking for leave, complaints, appointments, replying to an invitation) with a model answer side by side.
  - A self-check list of key patterns and connectives (did you use an `omdat` clause, the right salutation and closing).
  - Form-filling practice (name, address, BSN and similar fields).
- **Data**: `data/schrijven.json` (prompt + model_answer + checklist).

### Module 4 - Speaking / Spreken (B1)
- **Exam requirement**: after an image or spoken question, prepare for a few seconds and record an answer; describing, giving an opinion, phone situations.
- **App features**:
  - Speaking prompt cards (question played by TTS) + preparation countdown + optional recording.
  - Example answers and common expressions to make self-assessment possible.
- **Data**: `data/spreken.json` (prompt + prep_seconds + model_answer + phrases).

### Module 5 - Knowledge of society / KNM
- **Exam requirement**: general knowledge about Dutch society, institutions and values, asked through images or short clips with multiple choice.
- **App features**: a themed question bank (work and income, health, education, housing, history and geography, institutions, values) with multiple choice and explanations.
- **Data**: `data/knm.json` (question + options + answer + explanation + theme).

### Module 6 - Labour market / ONA, MAP
- **Exam requirement**: a portfolio (about 8 results: career orientation, CV, cover letter, Dutch workplace culture and so on) plus a closing interview; not multiple choice.
- **App features**:
  - A step-by-step checklist for the 8 results with progress ticks.
  - Dutch CV and cover-letter templates plus a quick tour of workplace culture.
  - Common closing-interview questions with suggested answers.
- **Data**: `data/ona.json` (result steps + templates + interview_qa).

### Cross-cutting module A - Vocabulary / Woordenschat (supports every skill)
- Upgrade the existing flashcards, multiple choice and gap fill into **B1 themed sets**, growing the deck past 2000 words (framework first, content in batches).
- Add a "spelling" mode and a two-way Dutch -> English / English -> Dutch mode.

### Cross-cutting module B - Grammar / Grammatica (supports reading, writing, speaking)
- Explain the B1 grammar points one by one with targeted exercises (inversion, perfect tense, separable verbs, subordinating conjunctions, comparatives, relative clauses, `er` constructions).
- **Data**: `data/grammatica.json` (topic + rule + examples + exercises).

---

## 3. App architecture (after the refactor)

```
DutchLearningBot/
├── main.py                # entry point + routing + readiness dashboard
├── ui/                    # one view per module
│   ├── dashboard.py       # readiness dashboard: 6 subjects + suggestions
│   ├── lezen.py           # reading
│   ├── luisteren.py       # listening (TTS)
│   ├── schrijven.py       # writing
│   ├── spreken.py         # speaking (TTS + recording)
│   ├── knm.py             # knowledge of society
│   ├── ona.py             # labour market
│   ├── woorden.py         # vocabulary (flashcards / choice / gap fill / spelling)
│   └── grammatica.py      # grammar
├── core/
│   ├── store.py          # deck and question-bank loading + progress storage
│   └── tts.py             # Dutch speech wrapper (macOS say, replaceable)
├── data/                  # all content as JSON (edit freely)
│   ├── vocabulary.json    # existing, to be split by theme
│   ├── grammatica.json
│   ├── lezen.json
│   ├── luisteren.json
│   ├── schrijven.json
│   ├── spreken.json
│   ├── knm.json
│   └── ona.json
├── data/progress.json     # study progress (generated)
├── DESIGN_B1.md           # this design document
└── README.md
```

> Note: a single `main.py` would still work, but with this many subjects the `ui/ + core/` split is easier to maintain.

---

## 4. Readiness dashboard (the core idea derived from the exam)

All 6 subjects must be passed, so the home screen is not a feature list but a **readiness dashboard**:

- One card per subject showing practice volume, recent accuracy and **readiness** (not started / in progress / close / ready).
- A "what to practise today" suggestion based on the weakest subject.
- A **mock exam mode** that follows the real structure and time limits, chaining one set each of reading, listening, writing, speaking and KNM into an overall score.

Readiness rules (thresholds are tunable, example values):
- Reading / listening / KNM: 80% or more correct over the last 20 questions -> ready.
- Writing / speaking: N tasks completed and self-assessed as passing -> ready.
- ONA: all 8 results ticked off -> ready.

---

## 5. Content targets and phased delivery (roadmap)

Because the B1 content is large, the approach is "build the skeleton for every module, give each subject real starter content, then expand in batches":

| Phase | Goal | Deliverable |
|---|---|---|
| P1 | Architecture refactor + readiness dashboard + themed vocabulary | All 6 subject entries clickable, vocabulary gains two-way and spelling modes |
| P2 | Reading + listening (TTS) + KNM question bank | The three multiple-choice subjects work end to end, with timing |
| P3 | Writing + speaking (models and examples with self-assessment) | Situational tasks + TTS prompts + recording |
| P4 | Grammar module + ONA guidance + mock exam | Grammar explain-and-drill + ONA checklist + full mock |
| P5 | Scale content up to B1 volume | 2000+ words, larger question banks everywhere |

---

## 6. Points to confirm or provide

1. **TTS for listening and speaking**: preferably the built-in macOS Dutch voices (download Xander/Claire/Ellen under System Settings -> Accessibility -> Spoken Content). Acceptable?
2. **Speech recording**: is real recording with playback needed, or is "see the prompt, compare with the example" enough for now?
3. **Content source**: starter question banks are written from scratch against the B1 syllabus; official practice material or textbooks can be imported to get closer to real exam items.
4. **File split**: is the `ui/ + core/` directory split fine, or should everything stay in a single file?