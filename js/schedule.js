// Critical-path scheduling shared by the planner (to show the timeline) and the simulator (to stress it).

/**
 * Turns template tasks ("start N weeks before the event") into day offsets from today.
 * If there is less time than the ideal lead, every start is compressed proportionally.
 */
export function buildSchedule(templateTasks, daysUntil) {
  const maxLead = Math.max(...templateTasks.map((t) => t.lead));
  const scale = Math.min(1, daysUntil / (maxLead * 7));
  const indexById = new Map(templateTasks.map((t, i) => [t.id, i]));
  return templateTasks.map((t) => ({
    id: t.id,
    name: t.name,
    deps: t.deps,
    depIdx: t.deps.map((d) => indexById.get(d)),
    // Vendors can often work faster when asked, but only partly: durations shrink by sqrt of the compression.
    dur: Math.max(2, Math.round(t.dur * Math.sqrt(scale))),
    lead: t.lead,
    startOffset: Math.max(0, daysUntil - Math.round(t.lead * 7 * scale)),
  }));
}

/** Fills `fin` with finish offsets (days from today) and returns the latest one. Tasks must be topologically ordered. */
export function scheduleFinish(tasks, durs, fin) {
  let latest = 0;
  for (let i = 0; i < tasks.length; i++) {
    let start = tasks[i].startOffset;
    for (const d of tasks[i].depIdx) if (fin[d] > start) start = fin[d];
    fin[i] = start + durs[i];
    if (fin[i] > latest) latest = fin[i];
  }
  return latest;
}

/**
 * Classic critical-path method with nominal durations. The critical tasks are those with the least slack
 * against the deadline: a delay to any of them delays the whole plan.
 */
export function criticalPath(tasks, deadline) {
  const n = tasks.length;
  const durs = tasks.map((t) => t.dur);
  const fin = new Array(n).fill(0);
  const days = scheduleFinish(tasks, durs, fin);
  const latestFinish = new Array(n).fill(deadline);
  for (let i = n - 1; i >= 0; i--) {
    const latestStart = latestFinish[i] - durs[i];
    for (const d of tasks[i].depIdx) latestFinish[d] = Math.min(latestFinish[d], latestStart);
  }
  const slack = fin.map((f, i) => latestFinish[i] - f);
  const least = Math.min(...slack);
  return { ids: tasks.filter((_, i) => slack[i] <= least + 0.5).map((t) => t.id), days, slack: least };
}
