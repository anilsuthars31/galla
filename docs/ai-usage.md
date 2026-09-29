# How AI was used to build Galla

Galla was built with Claude Code (an AI coding agent in the terminal) as part of the
"AI augmented software development" sprint. This file records how the work was split between me
and the AI, what I decided myself, and what went wrong and was caught.

> ✍️ Sections marked **[to write]** are my own reflections and still need to be filled in.

## How I steered the AI

- **`CLAUDE.md`** (in the repo root) is the working brief Claude Code reads at the start of every
  session: the stack, folder layout, category ids, labelling rules, engine rules (pure functions, no
  `Date.now()`), how to evaluate (never report accuracy on synthetic data), privacy rules and working
  style ("small steps, run tests, ask when unsure about a finance rule").
- **Small, checkable steps.** Tasks were given as numbered steps with a stop point
  ("do step 1 and stop so I can check the data report").
- **Tests as the contract.** `npm test` must pass before every commit; every engine module has tests.

## Timeline

| Commit | What | Built with AI? |
|---|---|---|
| `3c8a79c` | Project brief, earlier prototype, synthetic data, ML requirements | **[to write]** |
| `2cabe14` | Vite + React + TypeScript scaffold, Vitest, three.js | **[to write]** |
| `74a0730` | Engine ported to TypeScript modules with tests | **[to write]** |
| `55dd4eb` | UI with 3D month towers | **[to write]** |
| `8514bb3` | README | **[to write]** |
| `5be98ca` | ML pipeline: data check, features, training, evaluation | Claude Code, session of 2026-09-29 (below) |
| `30260b4` | Browser classifier + Python/TypeScript parity test | Claude Code, same session |
| `1787e3d` | Review suggestions in the ledger | Claude Code, same session |

## Session record: the V3 classifier (2026-09-29/30)

**The prompt** asked for six steps: a read-only data check, features exactly as `CLAUDE.md` specifies,
training with leave-one-file-out validation, an evaluation report with baselines, browser inference
with a parity test, and review suggestions in the ledger. It said to stop after step 1.

### Decisions I made (not the AI)

| Question the AI raised | Options it gave | My decision |
|---|---|---|
| 126 sale reversals going *out* are labelled `sales`. What category? | keep `sales` and subtract it from sales / map to `other` / new category | **`other`**, applied at load time, data files untouched ([D7](decisions.md)) |
| An older data file has mislabelled refunds and no `hard_case` column | include / exclude | **Exclude** ([D8](decisions.md)) |
| Where should the work go? | merge locally / pull request | Push the branch, then **merge into `main` from the terminal** |

`CLAUDE.md` tells the AI to ask instead of guessing on finance rules, and it did: it stopped before
training and waited for the reversal decision.

### What the AI found that I would have missed

- **Label problems before training.** `ml/check_data.py` found the 126 reversals labelled as income on
  withdrawals, the mislabelled older file, and that 71 edited rows were spelled `UPI MERCH SET`
  while the originals say `SETT` (a spelling only edited rows have, which a model could latch onto).
- **Template data.** Every synthetic file has exactly 12 salary, 6 rent and 3 EMI rows, so
  validation scores are optimistic. The report says so at the top.
- **A rule beating a correct model.** Rules + model scored *lower* than the model alone
  (macro-F1 0.911 vs 0.957). The cause: the rule "money in via UPI = sales" overrides 41 rows the
  model got right. Recorded as an open question ([D3](decisions.md)).

- **The forecast is less safe than designed.** A backtest (give the app months 1-3, compare its forecast
  with months 4-6) showed the closing balance overstated in 5 of 7 statements, because only income is
  forecast conservatively. The AI's first draft of the report *claimed* the forecast was safe; the numbers
  said otherwise, and the text was rewritten to be computed from the results
  ([forecast_results.md](forecast_results.md)).

### Mistakes that were caught

| What went wrong | How it was caught | Fix |
|---|---|---|
| The data report was written one folder *outside* the project | AI noticed in its own output | Moved to a temp folder |
| A test expected `₹500 …` to clean to `rs …`, but the code (correctly) gives `# rs …` | The test failed | Test expectation fixed; the code was right |
| The first data check counted correct refunds as "wrong side" | Reading the report | Reported as a labelling question, not an error |
| A row at 79.95% went to review but showed "80%" | Running a real statement through the app | Suggestions now round down |
| An automated edit (`sed`) silently didn't change an import | The type-check failed | Fixed by hand |
| On the live demo I couldn't find the "need review" button | I reported it; the AI drove headless Chrome against the live site: the button worked after an upload, but was *invisible* whenever nothing needed review (the sample data), so the feature looked missing | The top bar now always shows a status ("✓ All categorised" or "N need review") and the ledger filter is always visible |
| Git Bash turned `/galla/` into a Windows path in a test build | Checking the built HTML | Only this shell; GitHub's Linux build is unaffected |
| The Python and TypeScript features could drift apart | Designed against: parity test on 50 inputs, 1e-6 | Test passes; runs in CI |

### Verification, not trust

Nothing was accepted because the AI said it worked:
- Python n-grams were checked against scikit-learn on every narration in the data.
- Python rail detection was checked against the app's TypeScript on 4,238 narrations.
- TypeScript predictions were checked against Python (the parity test).
- A synthetic statement was run through the app's real pipeline: review rows went from 73 to 29.
- The full test suite (357 tests) passed before each commit, and CI now runs it on every push.

## My reflections **[to write]**

- Where the AI saved the most time:
- Where I had to correct or redirect it:
- What I would not hand to an AI again, and why:
- What I learned about writing instructions (`CLAUDE.md`, step-by-step prompts):
- The moment I realised the project was drifting towards ML (2026-09-30), and how I refocused:
