// UI controller: reads the form, builds the plan, runs the simulation in a worker and renders everything.

import { el, svg, clear } from './dom.js';
import { validateInput, LIMITS } from './validate.js';
import { generatePlan } from './planner.js';
import { analyze, applicableMitigations, DEFAULT_RUNS, SLIP_THRESHOLD_MIN } from './simulation.js';
import { buildNarrative, formatINR, pct, confidenceLabel } from './narrative.js';
import { fetchGeminiNarrative, isPlausibleKey } from './gemini.js';
import { localISODate, addDays } from './dates.js';

const $ = (id) => document.getElementById(id);
const FIELDS = ['type', 'guests', 'budget', 'date'];

const state = { pendingAi: false, plan: null, assumptions: null, active: [], analysis: null, ai: null, aiNote: '', apiKey: '' };

/* ---------- storage (optional; the app works without it) ---------- */

function loadChecks(scope) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`ct-checks-${scope}`) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveChecks(scope, set) {
  try {
    localStorage.setItem(`ct-checks-${scope}`, JSON.stringify([...set]));
  } catch {
    /* storage unavailable: checklist simply won't persist */
  }
}

/* ---------- form ---------- */

function readForm() {
  const form = $('intake');
  const data = new FormData(form);
  return {
    type: data.get('type'),
    guests: data.get('guests'),
    budget: data.get('budget'),
    date: data.get('date'),
    city: data.get('city'),
    outdoor: form.elements.outdoor.checked,
    diets: data.getAll('diets'),
    access: data.getAll('access'),
    notes: data.get('notes'),
  };
}

function showErrors(errors) {
  const summary = $('error-summary');
  clear(summary);
  const entries = Object.entries(errors);
  for (const f of FIELDS) {
    const input = $(f);
    const msg = errors[f] ?? '';
    $(`err-${f}`).textContent = msg;
    if (msg) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  summary.hidden = entries.length === 0;
  if (entries.length) {
    summary.append(
      el('strong', {}, 'Please fix the following:'),
      el('ul', {}, entries.map(([f, msg]) => el('li', {}, el('a', { href: `#${f}` }, msg)))),
    );
    summary.focus();
  }
}

/* ---------- simulation plumbing ---------- */

let worker = null;
let requestId = 0;

function startWorker() {
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (event.data.id === requestId) applyAnalysis(event.data.out);
    };
    worker.onerror = () => {
      worker = null;
      runAnalysis();
    };
  } catch {
    worker = null;
  }
}

function runAnalysis() {
  const id = ++requestId;
  const payload = { model: state.plan.model, assumptions: state.assumptions, active: state.active };
  if (worker) {
    worker.postMessage({ id, ...payload });
  } else {
    // No worker support (or blocked): fall back to the main thread.
    setTimeout(() => {
      if (id === requestId) applyAnalysis(analyze(payload.model, payload.assumptions, payload.active));
    }, 0);
  }
}

let debounce = 0;
function scheduleAnalysis() {
  clearTimeout(debounce);
  debounce = setTimeout(runAnalysis, 150);
}

function applyAnalysis(out) {
  state.analysis = out;
  renderSummary();
  renderTwinResults();
  if (state.pendingAi) {
    state.pendingAi = false;
    requestAi();
  }
  $('status').textContent = `Simulation updated. Event confidence is ${out.result.confidence} out of 100.`;
}

/* ---------- rendering helpers ---------- */

const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function heading(id, text) {
  return el('h2', { id }, text);
}

function metric(num, label) {
  return el('div', { class: 'metric' }, el('span', { class: 'num' }, num), el('span', { class: 'lbl' }, label));
}

/* ---------- sections ---------- */

function renderWarnings() {
  const box = $('warnings');
  clear(box);
  for (const w of state.plan.warnings) box.append(el('p', { class: 'notice', role: 'note' }, w));
}

function renderSummary() {
  const root = $('summary');
  clear(root);
  const { plan, analysis } = state;
  const { result, ranking } = analysis ?? {};
  root.append(heading('summary-h', 'Your plan at a glance'));
  root.append(
    el('p', {}, `${plan.event.typeLabel} for ${plan.event.guests} guests on ${fmtDate(plan.event.date)} (${plan.event.daysUntil} days away), budget ${formatINR(plan.event.budget)} (${formatINR(plan.event.perHead)} per guest).`),
  );
  if (!analysis) {
    root.append(el('p', { class: 'hint' }, 'Running 5,000 simulated events…'));
    return;
  }
  const narrative = state.ai ?? buildNarrative(plan, result, ranking);
  root.append(
    el(
      'div',
      { class: 'score-row' },
      el('div', { class: 'score', 'aria-label': `Event confidence ${result.confidence} out of 100` }, String(result.confidence), el('small', {}, ' / 100')),
      el('div', {}, el('h3', {}, confidenceLabel(result.confidence)), el('p', { class: 'hint' }, 'Event confidence blends the odds of staying on budget, running on time, and finishing the planning in time.')),
    ),
    el(
      'div',
      { class: 'metrics' },
      metric(pct(result.pOnBudget), 'chance of staying within budget'),
      metric(pct(1 - result.pSlip), `chance the day stays within ${SLIP_THRESHOLD_MIN} min of schedule`),
      metric(pct(result.pReady), 'chance all planning is done in time'),
    ),
    el('p', {}, narrative.summary),
    el('p', { class: 'tip' }, narrative.tip),
  );
  if (state.ai) root.append(el('p', { class: 'hint' }, 'Summary and ideas written by Gemini from your inputs and the simulation results.'));
  if (state.aiNote) root.append(el('p', { class: 'notice', role: 'status' }, state.aiNote));
}

function slider(id, label, min, max, step, value, format, onChange) {
  const out = el('output', { for: id }, format(value));
  const input = el('input', {
    id,
    type: 'range',
    min,
    max,
    step,
    value,
    oninput: () => {
      out.textContent = format(Number(input.value));
      onChange(Number(input.value));
    },
  });
  return el('div', { class: 'slider' }, el('label', { for: id }, label, ': ', out), input);
}

function renderTwinShell() {
  const root = $('twin');
  clear(root);
  const { plan } = state;
  root.append(
    heading('twin-h', 'Digital twin: rehearse your event'),
    el('p', {}, `We play your event out ${DEFAULT_RUNS.toLocaleString('en-IN')} times with random guest turnout, price changes, weather, vendor delays and task overruns. Change an assumption or switch on a safeguard and the odds update.`),
  );

  const controls = el('div', { class: 'controls' });
  controls.append(
    slider('rain', 'Chance of rain on the day', 0, 80, 5, Math.round(state.assumptions.rainChance * 100), (v) => `${v}%`, (v) => {
      state.assumptions.rainChance = v / 100;
      scheduleAnalysis();
    }),
    slider('vol', 'Price volatility', 5, 20, 1, state.assumptions.volatility * 10, (v) => `${(v / 10).toFixed(1)}×`, (v) => {
      state.assumptions.volatility = v / 10;
      scheduleAnalysis();
    }),
  );
  if (!plan.event.outdoor) controls.firstChild.querySelector('input').disabled = true;
  root.append(controls);
  if (!plan.event.outdoor) root.append(el('p', { class: 'hint' }, 'Rain only matters for outdoor events. Tick "Outdoor setting" in the form to include it.'));

  const safeguards = el('fieldset', {}, el('legend', {}, 'Safeguards you could buy'));
  const checks = el('div', { class: 'checks' });
  for (const m of applicableMitigations(plan.model)) {
    checks.append(
      el('label', { class: 'check' }, el('input', {
        type: 'checkbox',
        id: `m-${m.id}`,
        checked: state.active.includes(m.id),
        onchange: (e) => {
          state.active = e.target.checked ? [...state.active, m.id] : state.active.filter((x) => x !== m.id);
          scheduleAnalysis();
        },
      }), `${m.label} (${formatINR(m.costPct * plan.model.budget)})`),
    );
  }
  safeguards.append(checks);
  root.append(safeguards, el('div', { id: 'twin-results' }));
}

function histogramChart(result, budget) {
  const { histogram: h, spend } = result;
  const W = 640;
  const H = 200;
  const top = 12;
  const bottom = 30;
  const maxCount = Math.max(...h.counts);
  const bw = W / h.counts.length;
  const x = (v) => Math.min(W, Math.max(0, ((v - h.min) / (h.max - h.min || 1)) * W));
  const label = `Histogram of total spend across ${result.runs.toLocaleString('en-IN')} simulated events. Typical spend ${formatINR(spend.p50)}, nine in ten events cost less than ${formatINR(spend.p90)}. Your budget is ${formatINR(budget)}, and ${pct(result.pOnBudget)} of events stay within it.`;
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  h.counts.forEach((c, i) => {
    const height = (c / maxCount) * (H - top - bottom);
    const over = h.min + i * h.width >= budget;
    chart.append(svg('rect', { class: `b${over ? ' over' : ''}`, x: i * bw + 1, y: H - bottom - height, width: bw - 2, height }));
  });
  const bx = x(budget);
  chart.append(
    svg('line', { class: 'budget-line', x1: bx, x2: bx, y1: top, y2: H - bottom }),
    svg('text', { x: Math.min(Math.max(bx, 40), W - 40), y: H - 10, 'text-anchor': 'middle' }, `Budget ${formatINR(budget)}`),
    svg('text', { x: 0, y: H - 10, 'text-anchor': 'start' }, formatINR(h.min)),
    svg('text', { x: W, y: H - 10, 'text-anchor': 'end' }, formatINR(h.max)),
  );
  return chart;
}

function heatLevel(share) {
  if (share >= 0.25) return 2;
  if (share >= 0.12) return 1;
  return 0;
}

function renderTwinResults() {
  const root = $('twin-results');
  if (!root || !state.analysis) return;
  clear(root);
  const { result, ranking } = state.analysis;
  const { plan } = state;

  root.append(
    el('h3', {}, 'Where your total spend lands'),
    histogramChart(result, plan.model.budget),
    el('p', { class: 'legend' }, el('span', {}, el('span', { class: 'swatch ok' }), 'Within budget'), el('span', {}, el('span', { class: 'swatch over' }), 'Over budget'), el('span', {}, 'Dashed line: your budget')),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        {},
        el('caption', {}, 'Spend and delay outcomes'),
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Measure'), el('th', { scope: 'col', class: 'num' }, 'Value'))),
        el(
          'tbody',
          {},
          ...[
            ['Optimistic spend (10th percentile)', formatINR(result.spend.p10)],
            ['Typical spend (median)', formatINR(result.spend.p50)],
            ['Pessimistic spend (90th percentile)', formatINR(result.spend.p90)],
            ['Typical delay on the day', `${Math.round(result.slip.p50)} min`],
            ['Bad-day delay (90th percentile)', `${Math.round(result.slip.p90)} min`],
            ['Safeguards cost included', formatINR(result.mitigationCost)],
          ].map(([a, b]) => el('tr', {}, el('th', { scope: 'row' }, a), el('td', { class: 'num' }, b))),
        ),
      ),
    ),
    el('h3', {}, 'What is most likely to break your budget'),
    el(
      'div',
      { class: 'table-wrap' },
      el(
        'table',
        {},
        el('caption', {}, 'Overrun risk by budget line'),
        el('thead', {}, el('tr', {}, ...['Budget line', 'Planned', 'Chance of 10%+ overrun', 'Share of all overruns', 'Risk'].map((t, i) => el('th', { scope: 'col', class: i > 0 && i < 4 ? 'num' : '' }, t)))),
        el(
          'tbody',
          {},
          ...[...result.categories]
            .sort((a, b) => b.shareOfOverrun - a.shareOfOverrun)
            .map((c) => {
              const lvl = heatLevel(c.shareOfOverrun);
              return el(
                'tr',
                {},
                el('th', { scope: 'row' }, c.label),
                el('td', { class: 'num' }, formatINR(c.planned)),
                el('td', { class: 'num' }, pct(c.pOvershoot)),
                el('td', { class: 'num' }, pct(c.shareOfOverrun)),
                el('td', { class: `heat heat-${lvl}` }, ['Low', 'Medium', 'High'][lvl]),
              );
            }),
        ),
      ),
    ),
    el('h3', {}, 'Best next moves'),
  );

  if (ranking.length === 0) {
    root.append(el('p', {}, 'You have switched on every safeguard that applies.'));
    return;
  }
  const list = el('ul', { class: 'rank' });
  for (const r of ranking) {
    const good = r.gain > 0;
    list.append(
      el(
        'li',
        {},
        el('span', {}, el('strong', {}, r.label), el('br'), el('span', { class: 'hint' }, r.blurb)),
        el('span', {}, formatINR(r.cost), ' → ', el('span', { class: good ? 'gain-pos' : 'gain-neg' }, `${r.gain > 0 ? '+' : ''}${r.gain} pts`)),
        el('button', {
          type: 'button',
          class: 'btn small',
          'aria-label': `Try: ${r.label}`,
          onclick: () => {
            state.active = [...state.active, r.id];
            $(`m-${r.id}`).checked = true;
            runAnalysis();
          },
        }, 'Try it'),
      ),
    );
  }
  root.append(list, el('p', { class: 'hint' }, 'Points are changes in the 0 to 100 event confidence score, ranked by gain per ₹10,000 spent. A negative number means the safeguard costs more than the risk it removes.'));
}

function renderBudget() {
  const root = $('budget-section');
  clear(root);
  const { plan } = state;
  const rows = plan.budget.map((b) =>
    el(
      'tr',
      {},
      el('th', { scope: 'row' }, b.label, b.reserve ? el('span', { class: 'hint' }, ' (kept aside)') : ''),
      el('td', { class: 'num' }, `${Math.round(b.share * 100)}%`),
      el('td', { class: 'num' }, formatINR(b.amount)),
      el('td', {}, el('span', { class: 'bar', 'aria-hidden': 'true' })),
    ),
  );
  root.append(
    heading('budget-h', 'Budget breakdown'),
    el('div', { class: 'table-wrap' }, el(
      'table',
      {},
      el('caption', {}, `Where each rupee of ${formatINR(plan.event.budget)} goes`),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Category'), el('th', { scope: 'col', class: 'num' }, 'Share'), el('th', { scope: 'col', class: 'num' }, 'Amount'), el('th', { scope: 'col' }, 'Visual'))),
      el('tbody', {}, rows),
      el('tfoot', {}, el('tr', {}, el('td', {}, 'Total'), el('td', { class: 'num' }, '100%'), el('td', { class: 'num' }, formatINR(plan.event.budget)), el('td', {}))),
    )),
  );
  // Bars get their width through the CSSOM, which the page's strict style policy allows.
  root.querySelectorAll('tbody tr').forEach((tr, i) => {
    tr.querySelector('.bar').style.width = `${Math.max(2, plan.budget[i].share * 100 * 2.5)}%`;
  });
}

function renderTimeline() {
  const root = $('timeline-section');
  clear(root);
  const { plan } = state;
  const names = new Map(plan.timeline.map((t) => [t.id, t.name]));
  root.append(
    heading('timeline-h', 'Timeline, worked backwards from the event'),
    el('p', { class: 'hint' }, 'Tasks marked "Critical" form the longest chain: if one slips, the whole plan slips.'),
    el('div', { class: 'table-wrap' }, el(
      'table',
      {},
      el('caption', {}, 'Planning tasks in order of start date'),
      el('thead', {}, el('tr', {}, ...['Task', 'Start', 'Finish by', 'Needs first', ''].map((t) => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, [...plan.timeline].sort((a, b) => a.start.localeCompare(b.start)).map((t) => el(
        'tr',
        {},
        el('th', { scope: 'row' }, t.name),
        el('td', {}, fmtDate(t.start)),
        el('td', {}, fmtDate(t.due)),
        el('td', {}, t.deps.length ? t.deps.map((d) => names.get(d)).join(', ') : 'Nothing'),
        el('td', {}, t.critical ? el('span', { class: 'badge' }, 'Critical') : ''),
      ))),
    )),
  );
}

function renderVendors() {
  const root = $('vendors-section');
  clear(root);
  const { plan } = state;
  const scope = String(plan.model.seed);
  const done = loadChecks(scope);
  const grid = el('div', { class: 'vendor-grid' });
  for (const g of plan.vendors) {
    const set = el('fieldset', {}, el('legend', {}, g.label, g.budget ? ` (${formatINR(g.budget)})` : ''));
    g.items.forEach((item, i) => {
      const key = `${g.key}:${i}`;
      set.append(el('label', { class: 'check' }, el('input', {
        type: 'checkbox',
        checked: done.has(key),
        onchange: (e) => {
          if (e.target.checked) done.add(key);
          else done.delete(key);
          saveChecks(scope, done);
        },
      }), item));
    });
    grid.append(set);
  }
  root.append(heading('vendors-h', 'Vendor checklist'), el('p', { class: 'hint' }, 'Tick items off as you confirm them. Progress is saved in this browser.'), grid);
}

function renderIdeas() {
  const root = $('ideas-section');
  clear(root);
  const { plan } = state;
  const list = el('ul', { class: 'cards' });
  const items = state.ai ? state.ai.ideas.map((i) => ({ ...i, why: ['written by Gemini for your inputs'] })) : plan.ideas;
  for (const idea of items) {
    list.append(el('li', {}, el('h3', {}, idea.title), el('p', {}, idea.detail), idea.why?.length ? el('p', { class: 'why' }, `Why: ${idea.why.join(', ')}`) : null));
  }
  root.append(heading('ideas-h', 'Personalised ideas'), list);
}

function renderAll() {
  renderWarnings();
  renderSummary();
  renderTwinShell();
  renderBudget();
  renderTimeline();
  renderVendors();
  renderIdeas();
}

/* ---------- events ---------- */

async function requestAi() {
  state.ai = null;
  state.aiNote = '';
  if (!state.apiKey) return;
  if (!isPlausibleKey(state.apiKey)) {
    state.aiNote = 'The API key does not look right, so the built-in planner is shown instead.';
    renderSummary();
    return;
  }
  state.aiNote = 'Asking Gemini for ideas…';
  renderSummary();
  const snapshot = state.plan;
  try {
    const ai = await fetchGeminiNarrative({ apiKey: state.apiKey, plan: snapshot, sim: state.analysis.result });
    if (state.plan !== snapshot) return;
    state.ai = ai;
    state.aiNote = '';
  } catch (err) {
    if (state.plan !== snapshot) return;
    state.aiNote = `${err.message} Showing the built-in planner instead.`;
  }
  renderSummary();
  renderIdeas();
}

function onSubmit(event) {
  event.preventDefault();
  const check = validateInput(readForm());
  showErrors(check.errors);
  if (!check.ok) return;

  state.plan = generatePlan(check.value);
  state.assumptions = { rainChance: state.plan.model.rainChance, volatility: 1 };
  state.active = [];
  state.analysis = null;
  state.apiKey = $('apikey').value.trim();
  $('apikey').value = '';

  $('results').hidden = false;
  renderAll();
  $('summary-h').setAttribute('tabindex', '-1');
  $('summary-h').focus();
  state.pendingAi = true;
  runAnalysis();
}

function init() {
  const today = localISODate();
  $('date').min = addDays(today, 1);
  $('date').value = addDays(today, 200);
  $('guests').max = LIMITS.guestsMax;
  startWorker();
  $('intake').addEventListener('submit', onSubmit);
  $('print').addEventListener('click', () => window.print());
  $('download').addEventListener('click', () => {
    const { model, ...exportable } = state.plan;
    const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'celebration-plan.json' });
    a.click();
    URL.revokeObjectURL(url);
  });
}

init();
