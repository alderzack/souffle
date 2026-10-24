// Petit worker : vérifie par requêtes HEAD quels enregistrements de voix existent.
// Il répond [{ ok, type, offline }] dans l'ordre des adresses reçues. Aucune erreur n'est levée.
self.onmessage = async (event) => {
  const urls = Array.isArray(event.data) ? event.data : [];
  const out = await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      // Lire la réponse (vide) jusqu'au bout : la requête est alors terminée avant que le worker soit arrêté
      // (sinon elle reste « interrompue » côté navigateur).
      try { await r.arrayBuffer(); } catch { /* ignoré */ }
      return { ok: r.ok, type: r.headers.get('content-type') || '', offline: false };
    } catch {
      return { ok: false, type: '', offline: true };
    }
  }));
  self.postMessage(out);
};
