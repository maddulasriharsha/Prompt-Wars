// Monte Carlo "digital twin": plays the event out thousands of times with random attendance, prices,
// weather, vendor delays and task overruns, then reports the odds. Pure functions, seeded, no DOM.

import { mulberry32, normal, triangular } from './rng.js';
import { scheduleFinish, criticalPath } from './schedule.js';

export const SLIP_THRESHOLD_MIN = 60;
export const DEFAULT_RUNS = 5000;

const scaleRisk = (p, key, factor) => {
  p.riskScale[key] = (p.riskScale[key] ?? 1) * factor;
};

/** Each mitigation costs a share of the budget and bends one or more risk parameters. */
export const MITIGATIONS = [
  {
    id: 'rain-cover',
    label: 'Rain-proof backup (tent or indoor hold)',
    blurb: 'Removes weather overruns and rain delays.',
    costPct: 0.03,
    applies: (m) => m.outdoor,
    apply: (p) => {
      p.rainCover = true;
    },
  },
  {
    id: 'rsvp-deadline',
    label: 'Hard RSVP deadline with reminders',
    blurb: 'Halves the uncertainty in how many guests turn up.',
    costPct: 0.003,
    applies: () => true,
    apply: (p) => {
      p.attendanceVar *= 0.5;
    },
  },
  {
    id: 'fixed-catering',
    label: 'Fixed-price catering contract',
    blurb: 'Caps catering price swings and softens the effect of guest-count changes.',
    costPct: 0.01,
    applies: () => true,
    apply: (p) => {
      scaleRisk(p, 'catering', 0.4);
      p.guestSens.catering = 0.5;
    },
  },
  {
    id: 'early-booking',
    label: 'Book key vendors early',
    blurb: 'Locks prices before inflation and demand spikes.',
    costPct: 0.005,
    applies: () => true,
    apply: (p) => {
      p.inflationScale *= 0.3;
      scaleRisk(p, 'venue', 0.7);
      scaleRisk(p, 'decor', 0.8);
    },
  },
  {
    id: 'backup-vendors',
    label: 'Standby backup vendors',
    blurb: 'Cuts the chance that a late or missing vendor derails the day.',
    costPct: 0.01,
    applies: () => true,
    apply: (p) => {
      p.delayProbScale *= 0.4;
    },
  },
  {
    id: 'coordinator',
    label: 'Day-of coordinator',
    blurb: 'Shortens delays and keeps planning tasks on schedule.',
    costPct: 0.02,
    applies: () => true,
    apply: (p) => {
      p.delayMinScale *= 0.5;
      p.delayProbScale *= 0.8;
      p.durScale *= 0.9;
    },
  },
];

const mitigationById = new Map(MITIGATIONS.map((m) => [m.id, m]));

export function applicableMitigations(model) {
  return MITIGATIONS.filter((m) => m.applies(model));
}

function buildParams(activeIds) {
  const p = { attendanceVar: 1, inflationScale: 1, riskScale: {}, guestSens: {}, rainCover: false, delayProbScale: 1, delayMinScale: 1, durScale: 1 };
  for (const id of activeIds) mitigationById.get(id)?.apply(p);
  return p;
}

function percentile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function histogram(sorted, bins) {
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const width = (max - min) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const v of sorted) counts[Math.min(bins - 1, Math.floor((v - min) / width))]++;
  return { min, max, width, counts };
}

/**
 * Runs the Monte Carlo simulation.
 * @param model        `plan.model` from the planner
 * @param assumptions  { rainChance: 0..1, volatility: multiplier on price uncertainty }
 * @param activeIds    ids of mitigations switched on
 */
export function simulate(model, assumptions, activeIds = [], opts = {}) {
  const runs = opts.runs ?? DEFAULT_RUNS;
  const rng = mulberry32(opts.seed ?? model.seed);
  const p = buildParams(activeIds);
  const mitigationCost = activeIds.reduce((s, id) => s + (mitigationById.get(id)?.costPct ?? 0) * model.budget, 0);
  const spendLines = model.lines.filter((l) => !l.reserve);
  const { tasks, chain } = model;

  const spend = new Float64Array(runs);
  const overrun = new Float64Array(spendLines.length);
  const overshoot = new Uint32Array(spendLines.length);
  const slips = new Float64Array(runs);
  const durs = new Array(tasks.length);
  const fin = new Array(tasks.length);
  let onBudget = 0;
  let slipped = 0;
  let ready = 0;

  for (let r = 0; r < runs; r++) {
    // Draw order is fixed so a mitigation changes outcomes only through its parameters (common random numbers).
    const att = 1 + (triangular(rng, model.attendance.min, model.attendance.mode, model.attendance.max) - 1) * p.attendanceVar;
    const inflation = normal(rng, 0.02, 0.03 * assumptions.volatility * p.inflationScale);
    const rainRoll = rng();
    const rainSeverity = triangular(rng, 0.03, 0.06, 0.12);

    let total = mitigationCost;
    for (let i = 0; i < spendLines.length; i++) {
      const line = spendLines[i];
      const sens = p.guestSens[line.key] ?? (line.guestSensitive ? 1 : 0);
      const noise = Math.max(0.5, 1 + normal(rng) * line.risk * assumptions.volatility * (p.riskScale[line.key] ?? 1));
      const actual = line.amount * (1 + (att - 1) * sens) * (1 + inflation) * noise;
      total += actual;
      if (actual > line.amount) overrun[i] += actual - line.amount;
      if (actual > line.amount * 1.1) overshoot[i]++;
    }

    const rained = model.outdoor && rainRoll < assumptions.rainChance && !p.rainCover;
    if (rained) total += model.budget * rainSeverity;
    spend[r] = total;
    if (total <= model.budget) onBudget++;

    let slip = rained ? 30 : 0;
    for (const v of chain) {
      const hit = rng() < v.delayProb * p.delayProbScale;
      const minutes = triangular(rng, 15, 40, 150) * p.delayMinScale;
      if (hit) slip += minutes;
    }
    slips[r] = slip;
    if (slip > SLIP_THRESHOLD_MIN) slipped++;

    for (let t = 0; t < tasks.length; t++) durs[t] = tasks[t].dur * triangular(rng, 0.9, 1, 1.6) * p.durScale;
    if (scheduleFinish(tasks, durs, fin) <= model.daysUntil - 1) ready++;
  }

  const sortedSpend = Float64Array.from(spend).sort();
  const sortedSlip = Float64Array.from(slips).sort();
  const totalOverrun = overrun.reduce((a, b) => a + b, 0) / runs || 1;
  const pOnBudget = onBudget / runs;
  const pSlip = slipped / runs;
  const pReady = ready / runs;

  return {
    runs,
    pOnBudget,
    pSlip,
    pReady,
    confidence: Math.round(100 * (0.5 * pOnBudget + 0.25 * (1 - pSlip) + 0.25 * pReady)),
    mitigationCost,
    spend: {
      mean: spend.reduce((a, b) => a + b, 0) / runs,
      p10: percentile(sortedSpend, 0.1),
      p50: percentile(sortedSpend, 0.5),
      p90: percentile(sortedSpend, 0.9),
    },
    slip: { p50: percentile(sortedSlip, 0.5), p90: percentile(sortedSlip, 0.9) },
    histogram: histogram(sortedSpend, 24),
    categories: spendLines.map((l, i) => ({
      key: l.key,
      label: l.label,
      planned: l.amount,
      pOvershoot: overshoot[i] / runs,
      avgOverrun: overrun[i] / runs,
      shareOfOverrun: overrun[i] / runs / totalOverrun,
    })),
    criticalPath: criticalPath(tasks, model.daysUntil - 1),
  };
}

/** Tries each unused mitigation on top of the current set and ranks them by confidence gained per rupee. */
export function rankMitigations(model, assumptions, activeIds, base, opts = {}) {
  return applicableMitigations(model)
    .filter((m) => !activeIds.includes(m.id))
    .map((m) => {
      const trial = simulate(model, assumptions, [...activeIds, m.id], opts);
      const cost = m.costPct * model.budget;
      const gain = trial.confidence - base.confidence;
      return {
        id: m.id,
        label: m.label,
        blurb: m.blurb,
        cost,
        gain,
        gainPerTenK: gain / (Math.max(cost, 2000) / 10000),
        pOnBudget: trial.pOnBudget,
      };
    })
    .sort((a, b) => b.gainPerTenK - a.gainPerTenK);
}

export function analyze(model, assumptions, activeIds = [], opts = {}) {
  const result = simulate(model, assumptions, activeIds, opts);
  return { result, ranking: rankMitigations(model, assumptions, activeIds, result, opts) };
}
