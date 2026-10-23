// Turns validated input into a complete plan: budget, timeline, vendor checklist, ideas, and a simulation model.

import { TEMPLATES, RAIN_BY_MONTH, DAY_OF_CHAIN, DIETS, ACCESS_NEEDS } from './data.js';
import { buildSchedule, criticalPath } from './schedule.js';
import { addDays, daysBetween, localISODate, monthOf } from './dates.js';
import { hashString, mulberry32 } from './rng.js';

function splitBudget(template, budget) {
  const lines = template.lines.map((l) => ({ ...l, amount: Math.round((budget * l.share) / 100) * 100 }));
  // Rounding drift goes to the largest line so the plan always adds up exactly.
  const drift = budget - lines.reduce((s, l) => s + l.amount, 0);
  const largest = lines.reduce((a, b) => (b.amount > a.amount ? b : a));
  largest.amount += drift;
  return lines;
}

function budgetTier(perHead, tiers) {
  if (perHead < tiers[0]) return 'low';
  if (perHead < tiers[1]) return 'mid';
  return 'high';
}

function pickIdeas(template, input, tier, count = 6) {
  const words = new Set(
    `${input.notes} ${input.diets.join(' ')} ${input.access.join(' ')}`.toLowerCase().split(/[^a-z]+/).filter(Boolean),
  );
  const rng = mulberry32(hashString(JSON.stringify(input)));
  return template.ideas
    .map((idea) => {
      let score = 1 + rng() * 0.5; // small seeded jitter for variety without randomness between runs
      const why = [];
      if (idea.outdoor !== undefined && idea.outdoor === input.outdoor) {
        score += 2;
        why.push(input.outdoor ? 'suits an outdoor setting' : 'works well indoors');
      } else if (idea.outdoor !== undefined) {
        score -= 1.5;
      }
      if (idea.tier === tier) {
        score += 2;
        why.push(`fits a ${tier} per-guest budget`);
      } else if (idea.tier && idea.tier !== 'any') {
        score -= 1;
      }
      if (idea.minGuests && input.guests < idea.minGuests) score -= 3;
      if (idea.maxGuests && input.guests > idea.maxGuests) score -= 3;
      if (idea.needs?.some((n) => input.access.includes(n))) {
        score += 3;
        why.push('supports your guests’ needs');
      }
      if (idea.keywords?.some((k) => words.has(k))) {
        score += 3;
        why.push('matches your notes');
      }
      return { title: idea.title, detail: idea.detail, why, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(({ title, detail, why }) => ({ title, detail, why }));
}

function buildVendors(template, lines, input) {
  const groups = lines
    .filter((l) => !l.reserve && template.vendors[l.key])
    .map((l) => ({ key: l.key, label: l.label, budget: l.amount, items: [...template.vendors[l.key]] }));

  const needs = [
    ...input.diets.map((d) => `Confirm ${DIETS[d].toLowerCase()} options and separate preparation with the caterer.`),
    ...input.access.map((a) => ACCESS_NEEDS[a].item),
  ];
  if (needs.length) groups.push({ key: 'guest-needs', label: 'Guest needs', budget: null, items: needs });
  return groups;
}

export function generatePlan(input, now = new Date()) {
  const template = TEMPLATES[input.type];
  const today = localISODate(now);
  const daysUntil = daysBetween(today, input.date);
  const perHead = Math.round(input.budget / input.guests);
  const tier = budgetTier(perHead, template.tiers);

  const lines = splitBudget(template, input.budget);
  const tasks = buildSchedule(template.tasks, daysUntil);
  const path = criticalPath(tasks, daysUntil - 1);

  const timeline = tasks.map((t) => {
    const start = Math.min(t.startOffset, Math.max(daysUntil - 1, 0));
    const due = Math.min(t.startOffset + t.dur, Math.max(daysUntil - 1, start));
    return {
      id: t.id,
      name: t.name,
      start: addDays(today, start),
      due: addDays(today, due),
      deps: t.deps,
      critical: path.ids.includes(t.id),
    };
  });

  const warnings = [];
  if (perHead < template.minPerHead) {
    warnings.push(`Your budget works out to ₹${perHead.toLocaleString('en-IN')} per guest, which is below the usual minimum of about ₹${template.minPerHead.toLocaleString('en-IN')} for this type of event. Consider fewer guests or a bigger budget.`);
  }
  if (daysUntil < template.maxLeadWeeks * 7 * 0.5) {
    warnings.push(`Only ${daysUntil} day${daysUntil === 1 ? '' : 's'} to go, so the timeline has been compressed. Book the critical-path tasks first.`);
  }

  return {
    event: { ...input, today, daysUntil, perHead, tier, typeLabel: template.label },
    budget: lines.map(({ key, label, amount, reserve }) => ({ key, label, amount, share: amount / input.budget, reserve: Boolean(reserve) })),
    timeline,
    criticalPath: path.ids,
    vendors: buildVendors(template, lines, input),
    ideas: pickIdeas(template, input, tier),
    warnings,
    model: {
      type: input.type,
      guests: input.guests,
      budget: input.budget,
      outdoor: input.outdoor,
      daysUntil,
      seed: hashString(JSON.stringify(input)),
      rainChance: RAIN_BY_MONTH[monthOf(input.date)],
      attendance: template.attendance,
      lines: lines.map(({ key, label, amount, risk, guestSensitive, reserve }) => ({ key, label, amount, risk, guestSensitive, reserve: Boolean(reserve) })),
      chain: DAY_OF_CHAIN[input.type],
      tasks,
    },
  };
}
