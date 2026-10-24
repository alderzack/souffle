// Navigation interne synchrone et démarrage explicite des séances.
//
// Changer `location.hash` ne déclenche `hashchange` qu'un peu plus tard (tâche asynchrone) : entre le clic
// et ce moment, l'ancien écran reste affiché. `navigate` change l'ancre ET affiche le nouvel écran tout de
// suite ; le `hashchange` qui suit est ignoré par le routeur (même ancre déjà affichée).
//
// Une séance ne démarre jamais seule (C101) : seul un clic sur « Commencer » pose un jeton de démarrage,
// valable uniquement pendant l'affichage synchrone déclenché par ce clic. Un lien direct, un rechargement,
// un retour ou un avancer n'ont pas de jeton : l'écran « Prêt ? » s'affiche.

let handler = null;
let shown = null;        // ancre de l'écran actuellement affiché (null = écran à recréer)
let pendingStart = null; // id d'exercice à démarrer tout de suite (jeton à usage unique)

/** Enregistre la fonction d'affichage de l'écran courant (appelée par main.js). */
export function setRouteHandler(fn) {
  handler = fn;
}

/** Ancre de l'écran affiché, pour ignorer les `hashchange` déjà traités. */
export function shownHash() { return shown; }
export function setShownHash(hash) { shown = hash; }

/**
 * Va à l'ancre `hash` et affiche l'écran immédiatement.
 * `start` : id de l'exercice à démarrer sans passer par l'écran « Prêt ? » (clic sur « Commencer »).
 */
export function navigate(hash, { start = null } = {}) {
  pendingStart = start;
  try {
    if (location.hash !== hash) location.hash = hash;
    if (handler) handler();
  } finally {
    pendingStart = null;
  }
}

/** Vrai (une seule fois) si l'écran de séance `id` est affiché à la suite d'un clic sur « Commencer ». */
export function takeStartRequest(id) {
  if (pendingStart !== null && pendingStart === id) {
    pendingStart = null;
    return true;
  }
  return false;
}

/**
 * Remplace l'adresse courante sans créer d'entrée d'historique ni changer l'écran affiché
 * (ex. écran de fin de séance : l'adresse redevient « #/ »). Le prochain affichage de « #/ » recréera l'accueil.
 */
export function replaceHash(hash) {
  try {
    history.replaceState(history.state, '', hash);
  } catch { /* très vieux navigateur : l'adresse reste celle de la séance, qui affichera « Prêt ? » */ }
  shown = null;
}
