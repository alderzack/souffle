// Écran Historique : statistiques, liste des séances, suppression avec annulation.
import { h } from '../dom.js';
import { loadHistory, removeSession, restoreSession } from '../storage.js';
import { computeStats } from '../stats.js';
import { getExercise } from '../exercises.js';
import { plural, formatDay, formatTime, formatDateTime, formatSeconds } from '../format.js';

export const title = 'Ma pratique — Souffle';
export const UNDO_MS = 8000; // durée d'affichage du message « Séance supprimée. » (au moins 5 s)

export { formatSeconds };
/** Date d'une séance, ex. « mardi 20 octobre 2026 à 8 h 06 ». */
export const formatDate = (iso) => formatDateTime(new Date(iso));

export function mount(root) {
  const totalEl = h('span', { class: 'stat-value', testid: 'stat-total-minutes' });
  const weekEl = h('span', { class: 'stat-value', testid: 'stat-week-days' });
  const streakEl = h('span', { class: 'stat-value', testid: 'stat-streak' });
  const totalLbl = h('span', { class: 'stat-label' });
  const weekLbl = h('span', { class: 'stat-label' });
  const streakLbl = h('span', { class: 'stat-label' });
  const list = h('ul', { class: 'history-list', 'aria-label': 'Séances' });
  const empty = h('div', { class: 'card empty', testid: 'history-empty' },
    h('p', {}, 'Aucune séance pour l’instant. Ta première respiration t’attend.'),
    h('a', { href: '#/', class: 'btn btn-primary' }, 'Choisir un exercice'),
  );
  const status = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  const listTitle = h('h2', { class: 'section-title', tabindex: '-1' }, 'Séances');

  // --- Message de suppression avec « Annuler » ---
  const undoBtn = h('button', { type: 'button', class: 'btn btn-secondary btn-undo', testid: 'btn-undo-delete' }, 'Annuler');
  const toastText = h('p', { class: 'toast-text' }, 'Séance supprimée.');
  const toast = h('div', { class: 'toast', testid: 'delete-toast', role: 'status', tabindex: '-1', hidden: true }, toastText, undoBtn);
  let lastDeleted = null;
  let toastTimer = 0;

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = 0;
    lastDeleted = null;
    const hadFocus = toast.contains(document.activeElement);
    toast.hidden = true;
    if (hadFocus) listTitle.focus({ preventScroll: true }); // le focus ne se perd pas avec le message
  }

  function showToast(deleted) {
    clearTimeout(toastTimer);
    lastDeleted = deleted;
    toast.hidden = false;
    toastTimer = setTimeout(hideToast, UNDO_MS);
    // Focus sur le message lui-même (neutre) : jamais sur le « Supprimer » d'une autre séance.
    toast.focus({ preventScroll: true });
    toast.scrollIntoView?.({ block: 'nearest' });
  }

  undoBtn.addEventListener('click', () => {
    const d = lastDeleted;
    if (!d) return;
    restoreSession(d.entry, d.index);
    hideToast();
    render();
    status.textContent = 'Séance restaurée.';
    listTitle.focus({ preventScroll: true });
  });

  function render() {
    const history = loadHistory().slice().sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const stats = computeStats(history, new Date());
    totalEl.textContent = String(stats.totalMinutes);
    weekEl.textContent = String(stats.weekDays);
    streakEl.textContent = String(stats.streak);
    totalLbl.textContent = plural(stats.totalMinutes, 'minute au total', 'minutes au total');
    weekLbl.textContent = plural(stats.weekDays, 'jour cette semaine', 'jours cette semaine');
    streakLbl.textContent = plural(stats.streak, 'jour d’affilée', 'jours d’affilée');

    empty.hidden = history.length > 0;
    list.hidden = history.length === 0;
    list.replaceChildren(...history.map((e) => {
      const name = getExercise(e.exercise)?.name || 'Séance';
      const d = new Date(e.date);
      const when = formatDateTime(d);
      return h('li', { class: 'history-item', testid: 'history-item', dataset: { id: String(e.id) } },
        h('div', { class: 'history-main' },
          h('p', { class: 'history-name' }, name),
          h('p', { class: 'history-meta history-date' }, formatDay(d), ' à ', h('span', { class: 'nowrap' }, formatTime(d))),
          h('p', { class: 'history-meta history-duration' }, formatSeconds(e.seconds)),
        ),
        h('button', {
          type: 'button', class: 'btn btn-ghost btn-delete', testid: 'btn-delete-session',
          'aria-label': `Supprimer la séance ${name} du ${when}`,
          onclick: () => {
            const deleted = removeSession(e.id);
            render();
            if (deleted) showToast(deleted);
          },
        }, 'Supprimer'),
      );
    }));
  }

  root.append(
    h('header', { class: 'page-head' },
      h('h1', { tabindex: '-1' }, 'Ma pratique'),
      h('p', { class: 'lead' }, 'Chaque séance compte. Voici ton chemin jusqu’ici.'),
    ),
    h('section', { class: 'stats', 'aria-label': 'Statistiques' },
      h('p', { class: 'stat card' }, totalEl, ' ', totalLbl),
      h('p', { class: 'stat card' }, weekEl, ' ', weekLbl),
      h('p', { class: 'stat card' }, streakEl, ' ', streakLbl),
    ),
    listTitle,
    toast,
    empty,
    list,
    status,
    h('p', { class: 'note' }, 'Ton historique reste uniquement sur cet appareil.'),
  );
  render();
  return () => { clearTimeout(toastTimer); };
}
