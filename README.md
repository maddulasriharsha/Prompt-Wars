# Celebration Twin

**A GenAI-ready planning assistant for weddings, birthdays and community events that doesn't just make a plan. It rehearses your event 5,000 times and tells you the odds.**

Built for PromptWars Challenge 5 (Celebration & Event Planner). It covers budgets, timelines, vendor checklists and personalised ideas, then adds a Monte Carlo "digital twin" that shows how likely you are to stay on budget and on time, and which safeguard is worth buying.

## What it does

| Need from the brief | How Celebration Twin delivers it |
| --- | --- |
| Budget | Event-type-specific breakdown that always adds up exactly, with a per-guest sanity check |
| Timeline | Tasks worked backwards from the event date, with dependencies and a **critical path** (compressed automatically for short notice) |
| Vendor checklist | Per-category checklists plus a "Guest needs" group built from dietary and accessibility inputs; progress is saved locally |
| Personalised ideas | Ranked by setting, per-guest budget, guest count, guest needs and your notes, each with a "why" |
| GenAI | Optional Gemini integration (bring your own free key) for AI-written summary and ideas, with a full offline fallback |
| The twist | **Digital twin**: 5,000 seeded simulations of turnout, price swings, rain, vendor delays and task overruns |

### The digital twin

Each run randomises guest turnout, a shared inflation shock, per-line price noise, weather, day-of vendor delays and task durations along the critical path. You get:

- Chance of staying within budget, of the day running within 60 minutes of schedule, and of finishing planning in time, blended into one **Event Confidence** score
- A spend histogram with your budget marked, and percentile table
- A risk table showing which budget line causes most overruns
- **Best next moves**: each safeguard (rain cover, RSVP deadline, fixed-price catering, early booking, backup vendors, day-of coordinator) is re-simulated and ranked by confidence gained per rupee, including ones that are not worth buying
- Live sliders for rain chance and price volatility; the same seed means the same odds every time

## Run it

No build step and no dependencies.

```bash
npm start
```

Then open http://localhost:8080. (Any static file server works; ES modules need `http://`, not `file://`.)

```bash
npm test
```

Runs 26 tests with Node's built-in test runner.

### Optional: Gemini

Open "Optional: add Gemini" in the form and paste a free key from Google AI Studio. The key is held in memory only, sent only to `generativelanguage.googleapis.com` in a request header, and cleared from the field on submit. Without a key the built-in planner is used and nothing leaves your browser.

## Design notes mapped to the evaluation areas

- **Code quality**: small ES modules with one job each (`rng`, `dates`, `schedule`, `planner`, `simulation`, `validate`, `narrative`, `gemini`, `dom`, `app`). The engine is pure and DOM-free; domain data lives in `js/data.js`.
- **Security**: no backend and no secrets in the repo. Strict Content-Security-Policy (`script-src 'self'`, `connect-src` only Google's API). All user text is sanitised on input and rendered via text nodes, never `innerHTML`. Gemini output is parsed against a strict shape and cleaned. Prompt-injection hardening: user notes travel as JSON data under a system instruction that says to treat them as data. API key is format-checked, never put in a URL, and never echoed in errors.
- **Efficiency**: simulation runs in a Web Worker (falls back to the main thread). Ranking six safeguards reuses common random numbers, so comparisons are stable and cheap (about 0.3 s total). No framework, no dependencies; the whole repo is a few dozen KB.
- **Testing**: unit tests for RNG, dates, validation, template consistency, budget arithmetic, scheduling and critical path, simulation properties (determinism, monotonicity, mitigation effects) and the Gemini client with a mocked `fetch`, including failure modes.
- **Accessibility**: semantic landmarks and headings, skip link, labelled controls, error summary with `role="alert"` and links to fields, `aria-live` status updates, charts with full text alternatives and data tables, risk shown as text not colour alone, 44px targets, visible focus, light and dark themes, reduced-motion support, print stylesheet.
- **Problem alignment**: all four requested outputs for all three event types, plus guest-needs handling.

## Assumptions and limits

Costs, shares, volatilities and rain-by-month figures are planning heuristics (INR, tuned for India), not quotes. The rain chance is adjustable. The simulation is a decision aid, not a guarantee.

## Project layout

```
index.html        page and CSP
css/styles.css    themes, layout, print
js/app.js         UI controller
js/planner.js     plan generation
js/simulation.js  Monte Carlo engine and safeguards
js/schedule.js    critical-path scheduling
js/data.js        event templates
js/validate.js    input validation
js/gemini.js      optional AI client
js/narrative.js   offline summary
tests/            node:test suites
```
