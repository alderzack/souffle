// Statistiques de pratique — logique pure. Les jours sont comptés en heure locale.

const pad = (n) => String(n).padStart(2, '0');

/** Clé de jour local « AAAA-MM-JJ ». */
export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Total en minutes (arrondi à la minute la plus proche). */
export function totalMinutes(history) {
  const seconds = history.reduce((sum, e) => sum + (Number(e.seconds) || 0), 0);
  return Math.round(seconds / 60);
}

/** Lundi 00:00 (heure locale) de la semaine qui contient `now`. */
export function startOfWeek(now = new Date()) {
  const d = startOfDay(now);
  const offset = (d.getDay() + 6) % 7; // lundi = 0 … dimanche = 6
  return addDays(d, -offset);
}

/** Nombre de jours distincts pratiqués dans la semaine calendaire en cours (lundi → dimanche). */
export function weekDays(history, now = new Date()) {
  const from = startOfWeek(now).getTime();
  const to = addDays(startOfWeek(now), 7).getTime();
  const days = new Set();
  for (const e of history) {
    const t = Date.parse(e.date);
    if (t >= from && t < to) days.add(dayKey(new Date(t)));
  }
  return days.size;
}

/**
 * Série de jours consécutifs pratiqués, en finissant aujourd'hui.
 * Si rien aujourd'hui mais hier oui, la série d'hier compte encore (elle n'est pas perdue avant la fin de la journée).
 */
export function streak(history, now = new Date()) {
  const days = new Set(history.map((e) => dayKey(new Date(Date.parse(e.date)))));
  let day = startOfDay(now);
  if (!days.has(dayKey(day))) day = addDays(day, -1);
  let count = 0;
  while (days.has(dayKey(day))) { count += 1; day = addDays(day, -1); }
  return count;
}

export function computeStats(history, now = new Date()) {
  return { totalMinutes: totalMinutes(history), weekDays: weekDays(history, now), streak: streak(history, now) };
}
