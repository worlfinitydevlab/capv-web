// Sujets d'examens, etape 3 : depot et telechargement des fichiers Word. Le site ne decide de rien : la fonction serveur "sujets" donne une adresse
// signee (depot : un seul chemin, une seule fois ; telechargement : 60 secondes) et controle chaque fichier avant d'en faire une version.
import { getAuthedClient } from "../supabaseClient.js";
import { appeler } from "./sujetsApi.js";

export const BUCKET = "sujets-examens";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TAILLE_MAX = 26214400;   // 25 Mo

export function tailleLisible(octets) {
  const n = Number(octets);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return n + " o";
  if (n < 1048576) return Math.round(n / 1024) + " Ko";
  return (Math.round((n / 1048576) * 10) / 10).toString().replace(".", ",") + " Mo";
}
const deux = (n) => String(n).padStart(2, "0");
export function heureLocale(iso) { const d = new Date(iso); return isNaN(d) ? "" : deux(d.getHours()) + ":" + deux(d.getMinutes()); }
export function dateHeureLocale(iso) { const d = new Date(iso); return isNaN(d) ? "" : deux(d.getDate()) + "/" + deux(d.getMonth() + 1) + "/" + d.getFullYear() + " " + deux(d.getHours()) + ":" + deux(d.getMinutes()); }
// duree restante (ou ecoulee) en francais : « 1 h 20 min », « 5 min », « moins d'une minute »
export function dureeFr(ms) {
  const min = Math.max(0, Math.round(Math.abs(ms) / 60000));
  if (min < 1) return "moins d'une minute";
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return h + " h" + (m ? " " + deux(m) + " min" : "");
}

// Le message des erreurs du stockage (envoi du fichier vers l'adresse signee)
function messageEnvoi(e) {
  const code = String((e && (e.statusCode || e.status)) || "");
  const m = String((e && e.message) || "");
  if (code === "413" || /exceed|too large|maximum allowed/i.test(m)) return "Ce fichier est trop gros (25 Mo au plus). Réduis la taille des images puis réessaie.";
  if (code === "415" || /mime|not supported/i.test(m)) return "Ce type de fichier n'est pas accepté : choisis un document Word (.docx).";
  if (code === "409" || /already exists/i.test(m)) return "Ce dépôt a déjà été fait. Actualise la page.";
  return "Le fichier n'a pas pu être envoyé" + (m ? " (" + m + ")" : "") + ". Vérifie ta connexion et réessaie.";
}

// Depose une version : 1) demande d'adresse 2) envoi du fichier 3) controle et enregistrement par le serveur.
// Renvoie { ok, error, data } comme appeler(). data.conflit = vrai si la version est gardee mais pas retenue.
export async function deposerFichier(token, docId, fichier, note) {
  if (!fichier) return { ok: false, error: "Choisis d'abord ton fichier Word." };
  if (!/\.docx$/i.test(fichier.name || "")) return { ok: false, error: "Choisis un fichier Word au format .docx (pas .doc ni .pdf). Dans Word : Fichier > Enregistrer sous > « Document Word (*.docx) »." };
  if (!fichier.size) return { ok: false, error: "Ce fichier est vide." };
  if (fichier.size > TAILLE_MAX) return { ok: false, error: "Ce fichier est trop gros (" + tailleLisible(fichier.size) + ") : 25 Mo au plus. Réduis la taille des images puis réessaie." };
  const d = await appeler(token, "televerser_demande", { document_id: docId, taille: fichier.size });
  if (!d.ok) return d;
  const corps = new File([fichier], fichier.name, { type: DOCX_MIME });   // le navigateur ne connait pas toujours le type d'un .docx : le stockage, lui, l'exige
  let envoi;
  try { envoi = await getAuthedClient(token).storage.from(BUCKET).uploadToSignedUrl(d.data.chemin, d.data.token, corps); }
  catch (e) { return { ok: false, error: messageEnvoi(e) }; }
  if (envoi && envoi.error) return { ok: false, error: messageEnvoi(envoi.error) };
  const nomPropre = String(fichier.name).slice(0, 200);
  return await appeler(token, "televerser_finaliser", { document_id: docId, chemin: d.data.chemin, nom_fichier: nomPropre, motif: note && note.trim() ? note.trim() : undefined });
}

// Telecharge une version (la courante si numero est vide) : adresse signee de 60 s, le navigateur enregistre le fichier.
export async function telechargerFichier(token, docId, numero) {
  const r = await appeler(token, "telecharger", numero ? { document_id: docId, numero } : { document_id: docId });
  if (!r.ok) return r;
  const a = document.createElement("a");
  a.href = r.data.url; a.download = r.data.nom_fichier || ""; a.rel = "noopener"; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  return r;
}
