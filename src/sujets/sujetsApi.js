// Sujets d'examens : appels a la fonction serveur "sujets". Le serveur verifie le jeton de connexion et les droits : le site ne decide de rien.
import { SUJETS_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";

export async function appeler(token, action, corps) {
  try {
    const r = await fetch(SUJETS_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(corps || {}) })
    });
    let d = null;
    try { d = await r.json(); } catch (e) { /* reponse vide */ }
    if (!r.ok) {
      const defaut = r.status === 404 ? "La fonction serveur « sujets » n'est pas installée." : "Erreur " + r.status + ".";
      return { ok: false, status: r.status, code: (d && d.code) || null, error: (d && d.error) || defaut, data: d };
    }
    return { ok: true, status: r.status, data: d || {} };
  } catch (e) {
    return { ok: false, status: 0, reseau: true, error: "Connexion impossible. Réessaie.", data: null };
  }
}

// Le module n'est pas (encore) installe ou est coupe, ou la session n'est plus valable : le site se tait au lieu d'afficher des erreurs partout.
export function indisponible(r) {
  return !!r && !r.ok && (r.status === 404 || r.status === 503 || r.status === 401 || r.status === 403);
}

// « il y a 5 min », « hier », sinon la date
export function depuis(iso, maintenant) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor(((maintenant || Date.now()) - t) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return "il y a " + Math.floor(s / 60) + " min";
  if (s < 86400) return "il y a " + Math.floor(s / 3600) + " h";
  if (s < 172800) return "hier";
  return new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
