// Intercepte les appels relatifs /api/... de la pedagogie et les traite dans le navigateur (moteur + Supabase).
import { creerMoteur } from "./moteur.js";
import { creerStore } from "./store.js";
import { Erreur } from "./commun.js";
import { EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "../supabaseClient.js";

let courant = null; // { supabase, utilisateur, peut }
let installe = false;
let vraiFetch = null;
let cache = { cle: null, moteur: null }; // un seul moteur par utilisateur : il garde en memoire les sessions de saisie des notes

async function verifierMotDePasse(sb, username, password) {
  // meme appel que la connexion de l'application (AuthContext)
  let r, d = {};
  try {
    r = await vraiFetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
  } catch (e) { throw new Erreur(503, "Vérification impossible (réseau)."); }
  try { d = await r.json(); } catch (e) { d = {}; }
  if (r.ok && !d.error) return;
  if (r.status === 401 || r.status === 400 || r.status === 403) throw new Erreur(401, "Mot de passe incorrect");
  throw new Erreur(503, "Vérification impossible (code " + r.status + (d.error ? " : " + d.error : "") + ").");
}

function moteurCourant() {
  const par = (courant.utilisateur() && (courant.utilisateur().nom_complet || courant.utilisateur().username)) || "web";
  // Le client Supabase est recree a chaque affichage d'une page : on ne s'en sert JAMAIS pour decider de refaire le moteur
  // (sinon la session de saisie des notes, gardee en memoire par le moteur, etait perdue juste apres le mot de passe).
  // Le moteur lit donc toujours le client courant au moment de chaque requete.
  if (cache.moteur && cache.cle === par) return cache.moteur;
  const sb = { from: (table) => courant.supabase.from(table) };
  const ctx = {
    utilisateur: () => courant.utilisateur(),
    peut: (m, a) => courant.peut(m, a),
    verifier: (u, p) => verifierMotDePasse(sb, u, p)
  };
  cache = { cle: par, moteur: creerMoteur(creerStore(sb, par), ctx) };
  return cache.moteur;
}

export function brancher(contexte) {
  courant = contexte;
  if (installe || typeof window === "undefined") return;
  installe = true;
  vraiFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const u = typeof input === "string" ? input : input && input.url;
    if (courant && typeof u === "string" && u.startsWith("/api/")) {
      let corps = null;
      try { corps = init && init.body ? JSON.parse(init.body) : null; } catch (e) { corps = null; }
      const r = await moteurCourant().traiter((init && init.method) || "GET", u, corps);
      return new Response(JSON.stringify(r.data), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    return vraiFetch(input, init);
  };
}
