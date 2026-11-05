// Acces speciaux temporaires : etat partage (une seule copie pour tout le site), chronometre et appels a la fonction serveur "acces-special".
// - Le serveur est la reference : il envoie `restant_s` (secondes restantes) ; le chronometre local compte a partir de ce moment
//   (le plus grand ecoulement entre l'horloge de la machine et le compteur interne, pour ne jamais afficher trop de temps).
// - Si la fonction n'est pas installee (404) ou les tables absentes (503), le site se comporte exactement comme avant : aucune erreur affichee.
import { useEffect, useState, useSyncExternalStore } from "react";
import { ACCES_SPECIAL_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";

const INTERVALLE_MS = 120000;       // interrogation normale (onglet visible)
const INTERVALLE_INDISPONIBLE_MS = 600000;
const DELAI_MINI_MS = 15000;        // pas deux interrogations a moins de 15 s (sauf demande explicite)

// ---------------------------------------------------------------- appels a la fonction
export async function appeler(action, corps) {
  try {
    const r = await fetch(ACCES_SPECIAL_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(corps || {}) })
    });
    let d = null;
    try { d = await r.json(); } catch (e) { /* reponse vide */ }
    if (!r.ok) return { ok: false, status: r.status, error: (d && d.error) || (r.status === 404 ? "Les accès spéciaux ne sont pas installés." : "Erreur " + r.status), data: d };
    return { ok: true, status: r.status, data: d || {} };
  } catch (e) {
    return { ok: false, status: 0, reseau: true, error: "Connexion impossible. Réessaie.", data: null };
  }
}

// ---------------------------------------------------------------- etat
let etat = { grants: [], utilisateur: null, indisponible: false, version: 0 };
const abonnes = new Set();
let minuterie = null, cycle = null, dernierAppel = 0, dernierUtilisateur = null, enCours = null, echecs = 0, ecouteurs = false;

const maintenantMs = () => Date.now();
const perf = () => (typeof performance !== "undefined" && performance.now ? performance.now() : 0);

function emettre(changements) {
  etat = { ...etat, ...changements, version: etat.version + 1 };
  planifierExpiration();
  abonnes.forEach((f) => { try { f(); } catch (e) { /* un abonne ne doit pas bloquer les autres */ } });
}
function marquer(a) { return { ...a, _perf0: perf(), _date0: maintenantMs() }; }

// Secondes restantes d'un acces (jamais negatif)
export function restantS(g) {
  if (!g) return 0;
  const ecoule = Math.max((perf() - g._perf0) / 1000, (maintenantMs() - g._date0) / 1000, 0);
  return Math.max(0, Math.floor(g.restant_s - ecoule));
}
export function utilisable(g) {
  return !!g && restantS(g) > 0 && (g.utilisations_max == null || g.utilisations < g.utilisations_max);
}
export function actionsRestantes(g) { return g && g.utilisations_max != null ? Math.max(0, g.utilisations_max - g.utilisations) : null; }

function choisir(grants, tache) {
  const liste = grants.filter((g) => g.taches.includes(tache) && utilisable(g));
  liste.sort((a, b) => restantS(a) - restantS(b));
  return liste[0] || null;
}
export function lireAcces(tache) { return choisir(etat.grants, tache); }
export function lireTous() { return etat.grants.filter(utilisable); }

function planifierExpiration() {
  if (minuterie) { clearTimeout(minuterie); minuterie = null; }
  const restants = etat.grants.map(restantS).filter((s) => s > 0);
  if (!restants.length) return;
  const ms = Math.min(...restants) * 1000 + 80;
  minuterie = setTimeout(() => { minuterie = null; emettre({}); }, Math.min(ms, 2147483000));
}

// ---------------------------------------------------------------- interrogation
export function rafraichir(force) {
  if (!etat.utilisateur) return Promise.resolve();
  if (enCours) return enCours;
  if (!force && Date.now() - dernierAppel < DELAI_MINI_MS) return Promise.resolve();
  const qui = etat.utilisateur;
  dernierAppel = Date.now();
  enCours = (async () => {
    const r = await appeler("mes_acces", { username: qui });
    if (etat.utilisateur !== qui) return;
    if (r.ok) {
      echecs = 0;
      const grants = (r.data.acces || []).map(marquer);
      emettre({ grants, indisponible: false });
    } else if (r.status === 404 || r.status === 503 || r.status === 429) {
      emettre({ grants: [], indisponible: true });   // pas installe : on se tait
    } else {
      echecs += 1;                                    // reseau / erreur passagere : on garde ce qu'on sait
    }
  })().finally(() => { enCours = null; });
  return enCours;
}

function prochainDelai() {
  if (etat.indisponible) return INTERVALLE_INDISPONIBLE_MS;
  if (echecs > 0) return Math.min(600000, INTERVALLE_MS * Math.pow(2, echecs));
  return INTERVALLE_MS;
}
function boucle() {
  if (cycle) clearTimeout(cycle);
  cycle = setTimeout(async () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") await rafraichir(true);
    if (etat.utilisateur) boucle();
  }, prochainDelai());
}
function surVisibilite() { if (document.visibilityState === "visible") rafraichir(false); }
function surFocus() { rafraichir(false); }

export function demarrer(username) {
  if (!username) return;
  if (etat.utilisateur === username) return;
  arreter();
  etat = { ...etat, utilisateur: username, grants: [], indisponible: false };
  echecs = 0;
  // remontage immediat du meme composant (React en developpement) : on garde l'appel deja parti ; sinon on repart de zero
  if (dernierUtilisateur !== username || Date.now() - dernierAppel > 2000) dernierAppel = 0;
  dernierUtilisateur = username;
  if (!ecouteurs && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", surVisibilite);
    window.addEventListener("focus", surFocus);
    ecouteurs = true;
  }
  rafraichir(dernierAppel === 0).finally(() => { if (etat.utilisateur === username) boucle(); });
}
export function arreter() {
  if (cycle) { clearTimeout(cycle); cycle = null; }
  if (minuterie) { clearTimeout(minuterie); minuterie = null; }
  if (ecouteurs && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", surVisibilite);
    window.removeEventListener("focus", surFocus);
    ecouteurs = false;
  }
  emettre({ utilisateur: null, grants: [], indisponible: false });
}
// Apres une utilisation, le serveur renvoie l'acces mis a jour (compteur) : on le remplace tout de suite.
export function majAcces(acces) {
  if (!acces || !acces.id) return;
  const sans = etat.grants.filter((g) => g.id !== acces.id);
  emettre({ grants: acces.etat === "actif" ? [...sans, marquer(acces)] : sans });
}

// ---------------------------------------------------------------- hooks
function sAbonner(f) { abonnes.add(f); return () => abonnes.delete(f); }
const instantane = () => etat;

// L'acces actif pour une tache (ou null) : const acces = useAccesPour("suppression_eleve");
export function useAccesPour(tache) {
  const e = useSyncExternalStore(sAbonner, instantane, instantane);
  return choisir(e.grants, tache);
}
export function useAccesSpeciaux() {
  const e = useSyncExternalStore(sAbonner, instantane, instantane);
  return { grants: e.grants.filter(utilisable), indisponible: e.indisponible };
}
// Secondes restantes, mises a jour chaque seconde (a n'utiliser que dans le bandeau et la fenetre de confirmation)
export function useChrono(g) {
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!g) return undefined;
    const t = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [g && g.id]);
  return restantS(g);
}

export function formaterChrono(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const d2 = (n) => String(n).padStart(2, "0");
  return h > 0 ? h + ":" + d2(m) + ":" + d2(x) : d2(m) + ":" + d2(x);
}

// ---------------------------------------------------------------- utilisation d'un acces (cote personne qui agit)
// 1) utiliser : le serveur verifie le mot de passe de la personne et reserve la capacite ; 2) l'action est faite par le site ; 3) terminer : on rapporte le resultat.
export async function utiliserAcces({ username, password, tache, nb, cible, detail }) {
  const r = await appeler("utiliser", { username, password, tache, nb: nb || 1, cible: cible || null, detail: detail || null });
  if (r.ok && r.data.acces) majAcces(r.data.acces);
  if (!r.ok && (r.status === 403 || r.status === 429)) rafraichir(true);
  return r;
}
export async function terminerAcces({ evenementId, username, ok, message }) {
  const attentes = [0, 700, 1800];
  let dernier = null;
  for (const a of attentes) {
    if (a) await new Promise((res) => setTimeout(res, a));
    dernier = await appeler("terminer", { evenement_id: evenementId, username, ok: !!ok, message: message || null });
    if (dernier.ok || (dernier.status >= 400 && dernier.status < 500)) break;
  }
  rafraichir(true);
  return dernier;
}
