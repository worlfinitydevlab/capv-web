import { useSyncExternalStore } from "react";

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

let etat = { actifs: TOUS.slice(), espace: "finance", transition: null, apercu: null };
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
