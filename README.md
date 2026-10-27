# Dutch B1 Exam Trainer (DutchLearningBot)

A study tool for the Dutch integration exam (Inburgeringsexamen, B1). It ships in two shapes - a **web app** (mobile friendly) and a **macOS desktop app** - both driven by the same vocabulary deck.

Live version: <https://fanruihwaiting8.github.io/DutchLearningBot/>

## Web app (recommended, mobile first)

A plain static page: no backend, nothing to install, just open it in a phone browser. You can "Add to HomeScreen" to use it like a native app, and it works offline.

- **Daily Study** (default home): every day a fixed workload is generated automatically, about 20 minutes, no listening section.
  - 15 new words (flashcards) + 15 review words (Dutch -> English multiple choice)
  - 1 B1 passage + 3 comprehension questions (English translation can be shown, whole text can be read aloud)
  - 8 word-order exercises (tap the tiles to build the sentence)
  - A progress bar on top; the day counts as reached only when all three sections are done, and a **streak** of consecutive days is kept
  - Tasks come from a date seed: reloading on the same day changes nothing, a new day brings a new batch; new words prefer unseen entries, review words prefer previously missed ones
- **Readiness dashboard**: eight subjects - Vocabulary / Reading / Listening / Writing / Speaking / KNM / ONA / Grammar - each with its own readiness (Vocabulary and Reading have content today, the rest come in later phases).
- **Flashcards**: Dutch on the front, tap to flip for the English meaning and an example; words can be marked as mastered and read aloud.
- **Two-way multiple choice**: randomly Dutch -> English or English -> Dutch, four options, scored automatically.
- **Spelling**: write the Dutch word for an English prompt, submit with Enter; a wrong answer shows the correct spelling and reads it aloud.
- **Statistics**: mastered count, total answers, accuracy and readiness, with a one-click reset.
- **Profiles**: the button in the top-right corner switches between up to 8 named profiles, so several people can share one browser; every profile keeps its own mastered words, answer history and day streak. There are no passwords - the name only separates progress on this device.
- **Speech**: uses the browser Web Speech API (`nl-NL`), so a Dutch voice must be installed in the system or browser.

Readiness rule: take the last 20 answers; 80% or more correct counts as ready (same as the desktop app).

Progress is stored **locally in the browser** via `localStorage`, namespaced per profile:

| Key | Content |
| --- | --- |
| `dutch_b1_users_v1` | the profile list and the active profile id |
| `dutch_b1_progress_v2__<id>` | that profile's answer progress and mastered words |
| `dutch_b1_daily_v1__<id>` | that profile's daily plan, history and streak |

Progress saved before profiles existed (the keys without an `__<id>` suffix) is migrated into the first profile on first load, so nothing is lost. All of it is still lost when you switch devices or clear the cache, and it does not sync with the desktop app.

Local preview:

```bash
cd web && python3 -m http.server 8777
# open http://127.0.0.1:8777/ in a browser
# from a phone on the same network: http://<computer-ip>:8777/
```

> `web/data.js` inlines the whole deck, so opening `web/index.html` directly (`file://`) works too.

## macOS desktop app

Requires Python 3 with tkinter (bundled with the official macOS and Windows builds):

```bash
python3 main.py
```

Desktop progress is kept in `data/progress.json` (not tracked by git).

## Project layout

```
DutchLearningBot/
├── main.py                 # desktop entry point (tkinter)
├── core/
│   ├── store.py            # progress persistence, readiness calculation
│   └── tts.py              # speech (macOS say)
├── ui/                     # desktop views: theme / dashboard / woorden / placeholder
├── data/
│   ├── vocabulary.json     # vocabulary deck (single source of truth, edit freely)
│   ├── lezen.json          # reading passages + comprehension questions
│   ├── zinnen.json         # sentences used by the word-order drill
│   └── progress.json       # desktop progress (generated, gitignored)
├── tools/
│   └── build_web_data.py   # builds web/data.js from the three json files above
├── web/                    # web app (the directory published to GitHub Pages)
│   ├── index.html / styles.css / app.js
│   ├── daily.js            # Daily Study module
│   ├── data.js             # generated artefact, do not edit by hand
│   └── manifest.webmanifest / icon.svg / sw.js   # PWA
├── .github/workflows/pages.yml  # pushing to main deploys web/ to Pages
└── DESIGN_B1.md            # B1 feature design and roadmap
```

## Customising the deck

Edit the `words` array in `data/vocabulary.json`; each entry looks like:

```json
{
  "nl": "hallo",
  "en": "hello",
  "cat": "Greetings and politeness",
  "ex_nl": "Hallo, hoe gaat het?",
  "ex_en": "Hello, how are you?"
}
```

Reading material lives in `data/lezen.json` (`passages[]`, each with the Dutch text, an English translation and 3 questions); word-order sentences live in `data/zinnen.json` (`sentences[]`, where `nl` carries no final punctuation).

After editing you **must** regenerate the web data, otherwise the web app will not show the new content:

```bash
python3 tools/build_web_data.py
```

The desktop app picks up changes on restart; the web app redeploys automatically through Actions once `web/data.js` is committed.

## License

MIT