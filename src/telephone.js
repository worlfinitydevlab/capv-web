// Telephones : un indicatif de pays (+509 Haiti par defaut, a ne pas retaper) + le numero normal.
// Enregistre sous la forme compacte "+50937123456" ; affiche "+509 3712 3456". Fonctions pures (testables).

// [indicatif, pays] : un indicatif par ligne (les indicatifs d'un meme plan, comme le +1, sont regroupes)
export const PAYS_TEL = [
  ["509", "Haïti"],
  ["1", "États-Unis, Canada, Rép. dominicaine"],
  ["33", "France"],
  ["594", "Guyane française"],
  ["590", "Guadeloupe"],
  ["596", "Martinique"],
  ["32", "Belgique"],
  ["41", "Suisse"],
  ["34", "Espagne"],
  ["39", "Italie"],
  ["49", "Allemagne"],
  ["44", "Royaume-Uni"],
  ["56", "Chili"],
  ["55", "Brésil"],
  ["52", "Mexique"],
  ["507", "Panama"],
  ["53", "Cuba"],
  ["58", "Venezuela"],
  ["54", "Argentine"],
  ["57", "Colombie"],
  ["225", "Côte d'Ivoire"],
  ["221", "Sénégal"],
  ["237", "Cameroun"],
  ["229", "Bénin"],
  ["243", "RD Congo"],
  ["212", "Maroc"],
  ["972", "Israël"],
  ["86", "Chine"],
  ["81", "Japon"]
];
export const CODE_DEFAUT = "509";
export const AUTRE_PAYS = "autre";
const CODES = PAYS_TEL.map((p) => p[0]).sort((a, b) => b.length - a.length);

const chiffresDe = (brut) => { let c = String(brut).replace(/\D/g, ""); if (/^\s*00/.test(brut)) c = c.slice(2); return c; };

// Valeur enregistree -> { code, local } pour les deux zones du champ.
//   « +509 3712 3456 » -> 509 + "37123456" ; « +33612345678 » -> 33 + "612345678" ; indicatif inconnu -> code "autre" et numero complet avec « + » ;
//   ancien numero sans indicatif (« 3712-3456 ») -> garde tel quel avec +509 par defaut (rien n'est reecrit tant qu'on n'y touche pas)
export function decouperTelephone(valeur) {
  const brut = String(valeur == null ? "" : valeur).trim();
  if (!brut) return { code: CODE_DEFAUT, local: "" };
  const international = brut.startsWith("+") || /^00/.test(brut);
  const chiffres = chiffresDe(brut);
  if (international) {
    for (const c of CODES) if (chiffres.startsWith(c)) return { code: c, local: chiffres.slice(c.length) };
    return { code: AUTRE_PAYS, local: "+" + chiffres };
  }
  if (chiffres.length === 11 && chiffres.startsWith("509")) return { code: CODE_DEFAUT, local: chiffres.slice(3) };
  return { code: CODE_DEFAUT, local: brut };
}

// Zones du champ -> valeur enregistree ("" si le numero est vide)
export function composerTelephone(code, local) {
  const chiffres = String(local == null ? "" : local).replace(/\D/g, "");
  if (!chiffres) return "";
  return "+" + (code === AUTRE_PAYS ? "" : code) + chiffres;
}

function grouper(code, local) {
  if (code === "509" && local.length === 8) return local.slice(0, 4) + " " + local.slice(4);
  if (code === "1" && local.length === 10) return local.slice(0, 3) + " " + local.slice(3, 6) + " " + local.slice(6);
  return local;
}

// { vide } | { ok:false } | { ok:true, compact: "+50937123456", affiche: "+509 3712 3456" }
//   Haiti (+509) : 8 chiffres exactement ; autre pays : numero complet de 8 a 15 chiffres commencant par +
export function analyserTelephone(saisie) {
  const brut = String(saisie == null ? "" : saisie).trim();
  if (!brut) return { vide: true, ok: false };
  const international = brut.startsWith("+") || /^00/.test(brut);
  const chiffres = chiffresDe(brut);
  const haiti = (local) => ({ ok: true, compact: "+509" + local, affiche: "+509 " + grouper("509", local) });
  if (international) {
    if (chiffres.startsWith("509")) return chiffres.length === 11 ? haiti(chiffres.slice(3)) : { ok: false };
    if (chiffres.length < 8 || chiffres.length > 15) return { ok: false };
    const d = decouperTelephone("+" + chiffres);
    return { ok: true, compact: "+" + chiffres, affiche: d.code === AUTRE_PAYS ? "+" + chiffres : "+" + d.code + " " + grouper(d.code, d.local) };
  }
  if (chiffres.length === 8) return haiti(chiffres);
  if (chiffres.length === 11 && chiffres.startsWith("509")) return haiti(chiffres.slice(3));
  return { ok: false };
}

// Pour l'affichage (listes, details) : numero lisible si on le reconnait, sinon tel quel
export function afficherTelephone(valeur) {
  const a = analyserTelephone(valeur);
  return a.ok ? a.affiche : String(valeur == null ? "" : valeur);
}

// Numero local mis en forme pour la zone « numero » (apres avoir quitte le champ)
export function localAffiche(code, local) {
  const chiffres = String(local || "").replace(/\D/g, "");
  return code === AUTRE_PAYS ? local : grouper(code, chiffres);
}
