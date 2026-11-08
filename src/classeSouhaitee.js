// Classe precedente -> classe souhaitee a l'inscription.
//   - la classe souhaitee est proposee automatiquement : la classe qui suit la classe precedente dans l'ordre des classes de l'ecole (Regles academiques)
//   - elle reste modifiable (redoublement : la meme classe), mais jamais une classe plus basse que la classe precedente
// Fonctions pures (testables). Une classe qui n'est pas dans l'ordre defini n'est jamais bloquee et ne donne pas de proposition.
import { bas } from "./classeProposee.js";

const propre = (n) => String(n == null ? "" : n).replace(/\s+/g, " ").trim();

// Ordre defini dans Regles academiques (du plus bas au plus haut) ; liste vide si illisible
export async function chargerOrdreClasses(supabase) {
  try {
    const { data } = await supabase.from("pedagogie_reglages").select("valeur").eq("cle", "ordre_classes").is("deleted_at", null).limit(1);
    const liste = JSON.parse((data && data[0] && data[0].valeur) || "[]");
    return Array.isArray(liste) ? liste.map(propre).filter(Boolean) : [];
  } catch (e) { return []; }
}

// Rang dans l'ordre (1 = la plus basse) ; 0 si la classe n'y est pas
export function rangOrdre(ordre, nom) {
  const k = bas(nom);
  if (!k) return 0;
  return (ordre || []).findIndex((n) => bas(n) === k) + 1;
}

// Nom de la classe qui suit dans l'ordre ; "" si c'est la derniere ou si la classe n'est pas dans l'ordre
export function nomSuivant(ordre, nom) {
  const r = rangOrdre(ordre, nom);
  return r > 0 && r < (ordre || []).length ? ordre[r] : "";
}

// La classe souhaitee est-elle plus basse que la classe precedente ? (faux si l'une des deux n'est pas dans l'ordre)
export function plusBasseQue(ordre, souhaitee, precedente) {
  const rp = rangOrdre(ordre, precedente), rs = rangOrdre(ordre, souhaitee);
  return rp > 0 && rs > 0 && rs < rp;
}

// Classes de l'annee que l'on peut choisir : pas plus basses que la classe precedente
//   classes : [{ id, nom, ... }]
export function classesPermises(classes, ordre, precedente) {
  if (!rangOrdre(ordre, precedente)) return classes || [];
  return (classes || []).filter((c) => !plusBasseQue(ordre, c.nom, precedente));
}

// Classe a proposer (objet de `classes`) ou null : la suivante dans l'ordre, si elle existe cette annee
export function classeProposee(classes, ordre, precedente) {
  const suivante = nomSuivant(ordre, precedente);
  if (!suivante) return null;
  return (classes || []).find((c) => bas(c.nom) === bas(suivante)) || null;
}

// Phrase d'aide sous le menu « Classe souhaitee »
export function aideClasseSouhaitee(classes, ordre, precedente) {
  const p = propre(precedente);
  if (!p) return "";
  if (!rangOrdre(ordre, p)) return "";
  const suivante = nomSuivant(ordre, p);
  if (!suivante) return "« " + p + " » est la dernière classe de l'ordre des classes : choisis la classe souhaitée.";
  if (!classeProposee(classes, ordre, p)) return "La classe suivante (« " + suivante + " ») n'existe pas cette année : choisis la classe souhaitée.";
  return "Proposée : la classe qui suit « " + p + " ». Tu peux la changer (redoublement possible), mais pas choisir une classe plus basse.";
}
