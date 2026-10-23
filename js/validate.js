// Input validation and sanitisation. Everything the user types passes through here before use.

import { DIETS, ACCESS_NEEDS, TEMPLATES } from './data.js';
import { parseISO, daysBetween, localISODate } from './dates.js';

export const LIMITS = {
  guestsMin: 5,
  guestsMax: 2000,
  budgetMin: 5000,
  budgetMax: 100000000,
  notesMax: 300,
  cityMax: 60,
  horizonDays: 3650,
};

/** Strips control characters and markup-ish symbols, collapses whitespace and caps the length. */
export function sanitizeText(value, max) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>`{}\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function pickKnown(list, allowed) {
  const arr = Array.isArray(list) ? list : [];
  return [...new Set(arr.filter((k) => Object.hasOwn(allowed, k)))];
}

/** Returns { ok, errors, value }. `errors` maps field names to human-readable messages. */
export function validateInput(raw, now = new Date()) {
  const errors = {};
  const src = raw ?? {};

  const type = String(src.type ?? '');
  if (!Object.hasOwn(TEMPLATES, type)) errors.type = 'Choose a wedding, birthday or community event.';

  const guests = Number(src.guests);
  if (!Number.isInteger(guests) || guests < LIMITS.guestsMin || guests > LIMITS.guestsMax) {
    errors.guests = `Enter a whole number of guests between ${LIMITS.guestsMin} and ${LIMITS.guestsMax}.`;
  }

  const budget = Number(src.budget);
  if (!Number.isFinite(budget) || budget < LIMITS.budgetMin || budget > LIMITS.budgetMax) {
    errors.budget = `Enter a budget between ${LIMITS.budgetMin.toLocaleString('en-IN')} and ${LIMITS.budgetMax.toLocaleString('en-IN')} rupees.`;
  }

  const today = localISODate(now);
  const dateOk = parseISO(src.date) !== null;
  if (!dateOk) {
    errors.date = 'Pick a valid event date.';
  } else {
    const days = daysBetween(today, src.date);
    if (days < 1) errors.date = 'Pick a date after today.';
    else if (days > LIMITS.horizonDays) errors.date = 'Pick a date within the next 10 years.';
  }

  const value = {
    type,
    guests,
    budget: Math.round(budget),
    date: String(src.date ?? ''),
    city: sanitizeText(src.city, LIMITS.cityMax),
    outdoor: Boolean(src.outdoor),
    diets: pickKnown(src.diets, DIETS),
    access: pickKnown(src.access, ACCESS_NEEDS),
    notes: sanitizeText(src.notes, LIMITS.notesMax),
  };

  return { ok: Object.keys(errors).length === 0, errors, value };
}
