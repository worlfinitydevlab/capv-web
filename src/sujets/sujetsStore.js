// Sujets d'examens : notifications partagees par tout le site (cloche de l'en-tete et onglet Notifications).
// Une seule copie de l'etat, interrogee toutes les 60 s quand l'onglet est visible (et au retour sur l'onglet).
// Si la fonction n'est pas installee (404), coupee ou les tables absentes (503), ou si la session n'est plus valable : la cloche disparait, sans message.
import { useSyncExternalStore } from "react";
import { appeler, indisponible } from "./sujetsApi.js";

const INTERVALLE_MS = 60000;
const INTERVALLE_INDISPONIBLE_MS = 600000;
const DELAI_MINI_MS = 10000;     // pas deux interrogations a moins de 10 s (sauf demande explicite)

let etat = { utilisateur: null, notifications: [], non_lues: 0, indisponible: false, chargees: false, version: 0 };
const abonnes = new Set();
let jeton = null, cycle = null, dernierAppel = 0, enCours = null, echecs = 0, ecouteurs = false;

function emettre(changements) {
  etat = { ...etat, ...changements, version: etat.version + 1 };
  abonnes.forEach((f) => { try { f(); } catch (e) { /* un abonne ne doit pas bloquer les autres */ } });
}
export function definirJeton(t) { jeton = t || null; }

export function rafraichir(force) {
  if (!etat.utilisateur || !jeton) return Promise.resolve();
  if (enCours) return enCours;
  if (!force && Date.now() - dernierAppel < DELAI_MINI_MS) return Promise.resolve();
  const qui = etat.utilisateur;
  dernierAppel = Date.now();
  enCours = (async () => {
    const r = await appeler(jeton, "notifications", { limite: 30 });
    if (etat.utilisateur !== qui) return;
    if (r.ok) {
      echecs = 0;
      emettre({ notifications: r.data.notifications || [], non_lues: r.data.non_lues || 0, indisponible: false, chargees: true });
    } else if (indisponible(r)) {
      emettre({ notifications: [], non_lues: 0, indisponible: true, chargees: true });
    } else {
      echecs += 1;   // reseau / erreur passagere : on garde ce qu'on sait
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

export function demarrer(username, token) {
  if (!username) return;
  definirJeton(token);
  if (etat.utilisateur === username) return;
  arreter();
  etat = { ...etat, utilisateur: username, notifications: [], non_lues: 0, indisponible: false, chargees: false };
  echecs = 0; dernierAppel = 0;
  if (!ecouteurs && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", surVisibilite);
    window.addEventListener("focus", surFocus);
    ecouteurs = true;
  }
  rafraichir(true).finally(() => { if (etat.utilisateur === username) boucle(); });
}
export function arreter() {
  if (cycle) { clearTimeout(cycle); cycle = null; }
  if (ecouteurs && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", surVisibilite);
    window.removeEventListener("focus", surFocus);
    ecouteurs = false;
  }
  emettre({ utilisateur: null, notifications: [], non_lues: 0, indisponible: false, chargees: false });
}

// Marque comme lues (ids = liste d'identifiants, ou null = toutes). L'ecran change tout de suite, le serveur confirme ensuite.
export async function marquerLues(ids) {
  if (!jeton) return;
  const maintenant = new Date().toISOString();
  const cible = ids ? new Set(ids) : null;
  const notifications = etat.notifications.map((n) => (!n.lu_le && (!cible || cible.has(n.id)) ? { ...n, lu_le: maintenant } : n));
  emettre({ notifications, non_lues: notifications.filter((n) => !n.lu_le).length });
  const r = await appeler(jeton, "notifications_lues", ids ? { ids } : { toutes: true });
  if (r.ok) emettre({ non_lues: r.data.non_lues || 0 });
  else rafraichir(true);
}

function sAbonner(f) { abonnes.add(f); return () => abonnes.delete(f); }
const instantane = () => etat;
export function useNotificationsSujets() {
  return useSyncExternalStore(sAbonner, instantane, instantane);
}

// Onglet demande a la page « Sujets d'examens » (ex. un clic sur une notification d'attribution ouvre « Mes examens »).
let demande = { onglet: null, document: null, vue: null, n: 0 };
const abonnesDemande = new Set();
export function demanderOnglet(onglet, document, vue) {
  demande = { onglet: onglet || null, document: document || null, vue: vue || null, n: demande.n + 1 };
  abonnesDemande.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
}
export function oublierDemande() { demande = { onglet: null, document: null, vue: null, n: demande.n }; }
const sAbonnerDemande = (f) => { abonnesDemande.add(f); return () => abonnesDemande.delete(f); };
const instantaneDemande = () => demande;
export function useOngletDemande() { return useSyncExternalStore(sAbonnerDemande, instantaneDemande, instantaneDemande); }
// Quel onglet ouvre une notification ?
export function ongletDeNotification(n) {
  if (!n) return null;
  if (["attribution", "reattribution", "echeance", "document_annule", "document_restaure", "verrou_pris", "version_deposee", "verrou_force", "conflit"].includes(n.type)) return "mes";
  if (n.type === "poste_ecart") return "poste";
  if (n.type === "soumission") return "validation";
  if (n.type === "decision" || n.type === "rouverture") return "mes";
  return null;
}
// Que ouvre-t-on sur le document ? Les notifications du fichier Word ouvrent directement la fenetre « Fichier Word ».
export function vueDeNotification(n) {
  if (!n) return null;
  if (n.type === "conflit") return "conflit";
  if (["verrou_pris", "version_deposee", "verrou_force", "decision", "rouverture", "soumission"].includes(n.type)) return "fichier";
  return null;
}
