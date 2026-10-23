// Offline plain-language summary built from the simulation. Works with no API key and no network.

export function formatINR(n) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function pct(p) {
  return `${Math.round(p * 100)}%`;
}

export function confidenceLabel(score) {
  if (score >= 85) return 'Very strong';
  if (score >= 70) return 'Solid';
  if (score >= 50) return 'Shaky';
  return 'At risk';
}

export function buildNarrative(plan, sim, ranking) {
  const { event } = plan;
  const topRisk = [...sim.categories].sort((a, b) => b.shareOfOverrun - a.shareOfOverrun)[0];
  const best = ranking.find((r) => r.gain > 0);

  const headline = `${confidenceLabel(sim.confidence)}: ${sim.confidence}/100 event confidence`;
  const parts = [
    `Your ${event.guests}-guest ${event.typeLabel.toLowerCase()} on ${event.date} has a ${pct(sim.pOnBudget)} chance of finishing within ${formatINR(event.budget)}.`,
    `The most likely total spend is ${formatINR(sim.spend.p50)}, and in 1 in 10 simulated events it reaches ${formatINR(sim.spend.p90)} or more.`,
    topRisk ? `${topRisk.label} causes the biggest share of overruns (${pct(topRisk.shareOfOverrun)}).` : '',
    `There is a ${pct(sim.pSlip)} chance that vendor delays push the day more than an hour behind schedule, and a ${pct(sim.pReady)} chance that all planning tasks finish before the event.`,
  ].filter(Boolean);

  const tip = best
    ? `Best next move: ${best.label.toLowerCase()} (about ${formatINR(best.cost)}) lifts confidence by ${best.gain} points.`
    : 'None of the available safeguards improves your odds enough to justify its cost right now.';

  return { headline, summary: parts.join(' '), tip, source: 'built-in' };
}
