// Regles du passage d'annee (placer un eleve dans une annee passee) :
//   - la classe de l'annee passee ne peut pas etre SUPERIEURE a la classe de l'annee suivante (classe de reference)
//   - meme classe que la reference  -> decision de fin d'annee "maintenu" (il a redouble)
//   - classe inferieure a la reference -> decision "admis" (il est passe en classe superieure)
//   - sans classe de reference connue -> impossible (aucun controle possible)
// La reference est la classe de l'eleve dans l'annee la plus proche apres l'annee placee (annee suivante, ou la suivante si elle est vide).
// "Superieure / inferieure" suit l'ordre des classes defini dans Regles academiques (pedagogie_reglages, cle ordre_classes).
import { bas } from "./classeProposee.js";

export const cmpAnnee = (a, b) => String(a == null ? "" : a).localeCompare(String(b == null ? "" : b), "fr", { numeric: true });

export const LIBELLE_AUTO = { admis: "Admis", maintenu: "Maintenu (redouble)" };

// affectations : [{ annee_nom, classe_nom }] d'un eleve (toutes annees). Renvoie l'affectation de l'annee la plus proche APRES anneeNom, ou null.
export function referenceClasse(affectations, anneeNom) {
  const apres = (affectations || [])
    .filter((a) => a && a.classe_nom && a.annee_nom && cmpAnnee(a.annee_nom, anneeNom) > 0)
    .sort((x, y) => cmpAnnee(x.annee_nom, y.annee_nom));
  return apres.length ? apres[0] : null;
}

// ordre : noms des classes, de la plus basse a la plus haute. ref : { annee_nom, classe_nom } ou null.
// Renvoie { ok, decision, relation, raison } ; decision "admis" | "maintenu" quand ok.
export function evaluerChoix(ordre, ref, classeNom) {
  if (!ref) return { ok: false, decision: "", relation: "", raison: "aucune classe plus récente connue pour cet élève" };
  const rang = (ordre || []).map((n) => bas(n));
  const rangRef = rang.indexOf(bas(ref.classe_nom));
  const rangCible = rang.indexOf(bas(classeNom));
  if (bas(ref.classe_nom) === bas(classeNom)) return { ok: true, decision: "maintenu", relation: "meme", raison: "" };
  if (rangRef < 0) return { ok: false, decision: "", relation: "", raison: "la classe plus récente (« " + ref.classe_nom + " », " + ref.annee_nom + ") n'est pas dans l'ordre des classes (Règles académiques)" };
  if (rangCible < 0) return { ok: false, decision: "", relation: "", raison: "« " + classeNom + " » n'est pas dans l'ordre des classes (Règles académiques)" };
  if (rangCible > rangRef) return { ok: false, decision: "", relation: "superieure", raison: "« " + classeNom + " » est supérieure à « " + ref.classe_nom + " » (" + ref.annee_nom + ")" };
  return { ok: true, decision: "admis", relation: "inferieure", raison: "" };
}

// Ordre des classes (Regles academiques). Une erreur de lecture remonte : on ne devine pas l'ordre.
export async function lireOrdre(supabase) {
  const { data, error } = await supabase.from("pedagogie_reglages").select("valeur").eq("cle", "ordre_classes").is("deleted_at", null).limit(1);
  if (error) throw error;
  let noms = [];
  try { noms = JSON.parse((data && data[0] && data[0].valeur) || "[]"); } catch (e) { noms = []; }
  return (Array.isArray(noms) ? noms : []).map((n) => String(n == null ? "" : n).trim()).filter(Boolean);
}
