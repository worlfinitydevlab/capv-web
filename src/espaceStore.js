import { useSyncExternalStore } from "react";
import { getAuthedClient, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } from "./supabaseClient.js";

export const ESPACES = {
  finance: {
    id: "finance",
    nom: "Finance",
    resume: "Argent, comptabilité et logistique de l'établissement",
    fonctions: [
      "Caisse, paiements et reçus",
      "Grande caisse, petite caisse, comptes bancaires",
      "Comptabilité générale et états financiers",
      "Bourses, réductions et créances",
      "Magasin, approvisionnement et livraisons",
      "Tableau de bord financier"
    ]
  },
  pedagogie: {
    id: "pedagogie",
    nom: "Pédagogie",
    resume: "Vie scolaire, effectifs et suivi des élèves",
    fonctions: [
      "Tableau de bord pédagogique",
      "Effectifs par classe et par salle",
      "Suivi des inscriptions et des examens d'admission",
      "Notes et bulletins (bientôt)",
      "Emploi du temps (bientôt)",
      "Présences et discipline (bientôt)"
    ]
  }
};

const TOUS = ["finance", "pedagogie"];
const CLE_LOCAL = "capv_espace";

function lireLocal() {
  try {
    const v = window.localStorage.getItem(CLE_LOCAL);
    return TOUS.includes(v) ? v : "finance";
  } catch (e) { return "finance"; }
}

let etat = { actifs: TOUS.slice(), espace: "finance", transition: null, apercu: null, utilisateur: null };
const abonnes = new Set();

function appliquer() {
  try { document.documentElement.setAttribute("data-espace", etat.espace); } catch (e) {}
}

function emettre(patch) {
  etat = { ...etat, ...patch };
  appliquer();
  abonnes.forEach((f) => f());
}

// Le web recoit la liste des modules actifs depuis institution_settings (Supabase)
export function definirActifs(valeur) {
  const local = lireLocal();
  let actifs = String(valeur || "").split(",").map((x) => x.trim()).filter((x) => TOUS.includes(x));
  if (actifs.length === 0) actifs = TOUS.slice();
  const espace = actifs.includes(local) ? local : actifs[0];
  if (actifs.join() === etat.actifs.join() && espace === etat.espace) return;
  emettre({ actifs, espace });
}

export function allerA(cible, origine) {
  if (!TOUS.includes(cible) || etat.transition) return;
  if (!etat.actifs.includes(cible)) { emettre({ apercu: cible }); return; }
  if (cible === etat.espace) return;
  let reduit = false;
  try { reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  const changer = () => {
    try { window.localStorage.setItem(CLE_LOCAL, cible); } catch (e) {}
    emettre({ espace: cible });
  };
  if (reduit) { changer(); return; }
  const o = origine || { x: 120, y: 90 };
  emettre({ transition: { vers: cible, x: o.x, y: o.y } });
  setTimeout(changer, 420);
  setTimeout(() => emettre({ transition: null }), 1050);
}

export function definirUtilisateur(u) {
  if (etat.utilisateur && u && etat.utilisateur.username === u.username && etat.utilisateur.role === u.role) return;
  emettre({ utilisateur: u || null });
}

export async function enregistrerModules(modules, motDePasse) {
  const u = etat.utilisateur;
  if (!u) return { ok: false, error: "Utilisateur inconnu" };
  const liste = (modules || []).filter((m) => TOUS.includes(m));
  if (liste.length === 0) return { ok: false, error: "Au moins un espace doit rester actif" };
  try {
    const r = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, password: motDePasse })
    });
    if (!r.ok) return { ok: false, error: "Mot de passe incorrect" };
    const sb = getAuthedClient(null);
    const { data: ver } = await sb.from("users").select("role_nom").eq("username", u.username).maybeSingle();
    if (!ver || ver.role_nom !== "Super Admin") return { ok: false, error: "Opération réservée au compte Worlfinity" };
    const { data: cur } = await sb.from("institution_settings").select("version").eq("id", 1).maybeSingle();
    const valeur = liste.join(",");
    const { error } = await sb.from("institution_settings").update({
      modules_actifs: valeur,
      version: ((cur && cur.version) || 1) + 1,
      last_modified_at: new Date().toISOString(),
      modified_by: u.username
    }).eq("id", 1);
    if (error) return { ok: false, error: error.message };
    definirActifs(valeur);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "Serveur injoignable" };
  }
}

export function fermerApercu() { emettre({ apercu: null }); }

function abonner(f) { abonnes.add(f); return () => abonnes.delete(f); }
function instantane() { return etat; }

export function useEspace() {
  return useSyncExternalStore(abonner, instantane);
}

if (typeof window !== "undefined") {
  etat = { ...etat, espace: lireLocal() };
  appliquer();
}
