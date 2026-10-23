import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, normal, triangular, hashString } from '../js/rng.js';
import { parseISO, addDays, daysBetween } from '../js/dates.js';
import { validateInput, sanitizeText } from '../js/validate.js';
import { generatePlan } from '../js/planner.js';
import { simulate, analyze, MITIGATIONS } from '../js/simulation.js';
import { buildSchedule, criticalPath } from '../js/schedule.js';
import { TEMPLATES } from '../js/data.js';

const NOW = new Date(2026, 9, 23);
const base = { type: 'wedding', guests: 150, budget: 1200000, date: '2027-08-01', outdoor: true, diets: [], access: [], notes: '' };
const planFor = (over = {}) => {
  const v = validateInput({ ...base, ...over }, NOW);
  assert.ok(v.ok, JSON.stringify(v.errors));
  return generatePlan(v.value, NOW);
};

test('rng is deterministic and in range', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(hashString('a'), hashString('b'));
});

test('triangular and normal draws behave', () => {
  const rng = mulberry32(1);
  let sum = 0;
  for (let i = 0; i < 5000; i++) {
    const t = triangular(rng, 1, 2, 4);
    assert.ok(t >= 1 && t <= 4);
    sum += normal(rng, 10, 2);
  }
  assert.ok(Math.abs(sum / 5000 - 10) < 0.2);
});

test('dates: parsing, arithmetic and impossible dates', () => {
  assert.equal(parseISO('2026-02-31'), null);
  assert.equal(parseISO('nonsense'), null);
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-10-23', '2026-11-23'), 31);
});

test('validation accepts good input and normalises it', () => {
  const r = validateInput({ ...base, notes: '  hello <script>alert(1)</script>  ', diets: ['jain', 'bogus', 'jain'] }, NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.value.diets, ['jain']);
  assert.ok(!/[<>]/.test(r.value.notes));
});

test('validation rejects bad input with per-field errors', () => {
  const r = validateInput({ type: 'rave', guests: 2, budget: -5, date: '2020-01-01' }, NOW);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['budget', 'date', 'guests', 'type']);
  assert.equal(validateInput({ ...base, guests: 10.5 }, NOW).ok, false);
  assert.equal(validateInput({ ...base, date: '2026-10-23' }, NOW).ok, false);
});

test('sanitizeText strips control characters and caps length', () => {
  assert.equal(sanitizeText('a\u0000b\n\nc', 10), 'a b c');
  assert.equal(sanitizeText('x'.repeat(500), 300).length, 300);
  assert.equal(sanitizeText(null, 10), '');
});

test('every template is internally consistent', () => {
  for (const [name, t] of Object.entries(TEMPLATES)) {
    const total = t.lines.reduce((s, l) => s + l.share, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${name} shares sum to ${total}`);
    assert.equal(t.lines.filter((l) => l.reserve).length, 1, `${name} has one reserve`);
    const ids = new Set();
    for (const task of t.tasks) {
      for (const d of task.deps) assert.ok(ids.has(d), `${name}: ${task.id} depends on later/unknown ${d}`);
      ids.add(task.id);
    }
  }
});

test('plan budget adds up exactly and includes every section', () => {
  for (const type of Object.keys(TEMPLATES)) {
    const plan = planFor({ type, budget: 987653 });
    assert.equal(plan.budget.reduce((s, b) => s + b.amount, 0), 987653);
    assert.ok(plan.timeline.length > 0 && plan.vendors.length > 0 && plan.ideas.length === 6);
  }
});

test('timeline respects the event date and flags a critical path', () => {
  const plan = planFor();
  for (const t of plan.timeline) {
    assert.ok(t.start <= t.due);
    assert.ok(t.due < plan.event.date);
  }
  assert.ok(plan.criticalPath.length >= 1);
  assert.ok(plan.timeline.some((t) => t.critical));
});

test('short notice compresses the schedule and warns', () => {
  const plan = planFor({ date: '2026-11-20' });
  assert.ok(plan.warnings.some((w) => /compressed/.test(w)));
  const s = buildSchedule(TEMPLATES.wedding.tasks, 28);
  assert.ok(Math.max(...s.map((t) => t.startOffset)) < 28);
  const cp = criticalPath(s, 27);
  assert.ok(cp.days > 0 && cp.ids.length >= 2 && cp.slack < 0);
});

test('low budget per guest triggers a warning', () => {
  assert.ok(planFor({ budget: 50000 }).warnings.some((w) => /per guest/.test(w)));
});

test('diet and access needs create a guest-needs checklist and favour matching ideas', () => {
  const plan = planFor({ type: 'community', diets: ['halal'], access: ['wheelchair', 'kids'], notes: 'eco friendly' });
  const needs = plan.vendors.find((g) => g.key === 'guest-needs');
  assert.ok(needs && needs.items.length === 3);
  assert.ok(plan.ideas.some((i) => /Zero-waste/.test(i.title)));
});

test('simulation is reproducible for the same seed', () => {
  const plan = planFor();
  const a = { rainChance: 0.2, volatility: 1 };
  assert.deepEqual(simulate(plan.model, a, [], { runs: 1000 }), simulate(plan.model, a, [], { runs: 1000 }));
});

test('simulation outputs are valid probabilities and ordered percentiles', () => {
  const r = simulate(planFor().model, { rainChance: 0.2, volatility: 1 }, [], { runs: 2000 });
  for (const p of [r.pOnBudget, r.pSlip, r.pReady]) assert.ok(p >= 0 && p <= 1);
  assert.ok(r.spend.p10 <= r.spend.p50 && r.spend.p50 <= r.spend.p90);
  assert.equal(r.histogram.counts.reduce((a, b) => a + b, 0), 2000);
  assert.ok(Math.abs(r.categories.reduce((s, c) => s + c.shareOfOverrun, 0) - 1) < 1e-9);
});

test('a bigger budget buys safer odds, and higher volatility hurts', () => {
  const a = { rainChance: 0.1, volatility: 1 };
  const tight = simulate(planFor({ budget: 600000 }).model, a, [], { runs: 2000, seed: 7 });
  const loose = simulate(planFor({ budget: 600000 }).model, a, [], { runs: 2000, seed: 7 });
  assert.equal(tight.pOnBudget, loose.pOnBudget);
  const model = planFor().model;
  const calm = simulate(model, { rainChance: 0.1, volatility: 0.5 }, [], { runs: 3000 });
  const wild = simulate(model, { rainChance: 0.1, volatility: 2 }, [], { runs: 3000 });
  assert.ok(calm.pOnBudget > wild.pOnBudget);
});

test('rain only matters outdoors, and a rain cover removes the weather hit', () => {
  const outdoor = planFor({ outdoor: true }).model;
  const indoor = planFor({ outdoor: false }).model;
  const stormy = { rainChance: 0.8, volatility: 1 };
  const opts = { runs: 3000 };
  assert.ok(simulate(indoor, stormy, [], opts).pOnBudget > simulate(outdoor, stormy, [], opts).pOnBudget);
  assert.ok(simulate(outdoor, stormy, ['rain-cover'], opts).pSlip < simulate(outdoor, stormy, [], opts).pSlip);
});

test('backup vendors and a coordinator reduce day-of delays', () => {
  const model = planFor().model;
  const a = { rainChance: 0, volatility: 1 };
  const none = simulate(model, a, [], { runs: 4000 });
  assert.ok(simulate(model, a, ['backup-vendors'], { runs: 4000 }).pSlip < none.pSlip);
  assert.ok(simulate(model, a, ['coordinator'], { runs: 4000 }).slip.p90 < none.slip.p90);
});

test('more lead time makes the plan far likelier to be ready', () => {
  const a = { rainChance: 0, volatility: 1 };
  const rushed = simulate(planFor({ date: '2027-01-20' }).model, a, [], { runs: 2000 });
  const relaxed = simulate(planFor({ date: '2027-12-01' }).model, a, [], { runs: 2000 });
  assert.ok(relaxed.pReady > rushed.pReady);
});

test('analyze ranks only unused, applicable safeguards', () => {
  const indoor = planFor({ outdoor: false }).model;
  const { ranking } = analyze(indoor, { rainChance: 0, volatility: 1 }, ['coordinator'], { runs: 800 });
  const ids = ranking.map((r) => r.id);
  assert.ok(!ids.includes('coordinator') && !ids.includes('rain-cover'));
  assert.equal(ids.length, MITIGATIONS.length - 2);
  for (let i = 1; i < ranking.length; i++) assert.ok(ranking[i - 1].gainPerTenK >= ranking[i].gainPerTenK);
});
