// Alerte anti-doublon : compare un nom saisi avec les noms deja enregistres (accents, majuscules et espaces ignores)
const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const mots = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Noms de classes, sections ou salles : identique, l'un commence par l'autre (ex. "3e AF" et "3e AF A"), ou une lettre d'ecart
export function nomProche(saisi, existant) {
  const a = norm(saisi), b = norm(existant);
  if (!a || !b) return "";
  if (a === b) return "identique";
  const court = a.length <= b.length ? a : b, long = a.length <= b.length ? b : a;
  if (court.length >= 3 && long.startsWith(court) && !/^[0-9]/.test(long.slice(court.length))) return "proche";
  if (a.length >= 4 && b.length >= 4 && a.replace(/\D/g, "") === b.replace(/\D/g, "") && lev(a, b) <= 1) return "proche";
  return "";
}
// Eleves : memes mots dans le nom et le prenom (ordre libre), ou une ou deux lettres d'ecart, ou un nom complet contenu dans l'autre
export function eleveProche(nom, prenom, ex) {
  const A = mots((nom || "") + " " + (prenom || "")).sort(), B = mots((ex.nom || "") + " " + (ex.prenom || "")).sort();
  if (!A.length || !B.length) return "";
  const ja = A.join(""), jb = B.join("");
  if (ja === jb) return "identique";
  if (ja.length >= 8 && jb.length >= 8 && lev(ja, jb) <= 2) return "proche";
  const [p, g] = A.length <= B.length ? [A, B] : [B, A];
  if (p.length >= 2 && p.every((w) => g.includes(w))) return "proche";
  return "";
}
function message(titreExiste, titreProche, saisi, trouves, lignes) {
  const exact = trouves.some((t) => t.niveau === "identique");
  return { exact, titre: exact ? titreExiste : titreProche, lignes: lignes.slice(0, 6), reste: Math.max(0, lignes.length - 6), saisi };
}
export function messageClasses(genre, saisi, trouves) {
  const g = genre;
  return message("Une " + g.mot + " avec ce nom existe déjà.", "Une " + g.mot + " au nom très proche existe déjà. Faute de frappe ou doublon ?", saisi, trouves, trouves.map((t) => t.libelle));
}
export function messageEleves(saisi, trouves) {
  return message("Un élève avec le même nom existe déjà.", "Un élève au nom très proche existe déjà. Doublon possible ?", saisi, trouves, trouves.map((t) => t.libelle));
}
// Fenetre de confirmation aux couleurs de l'application : renvoie une promesse (true = creer quand meme)
export function demanderDoublon(info) {
  return new Promise((resolve) => {
    if (!info || typeof document === "undefined") { resolve(!info); return; }
    const el = (tag, cls, txt, st) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (st) e.style.cssText = st; return e; };
    const overlay = el("div", "modal-overlay"); overlay.style.zIndex = "99999";
    const card = el("div", "modal-card", null, "width:460px;max-width:92vw");
    const fin = (v) => { document.removeEventListener("keydown", cle, true); overlay.remove(); resolve(v); };
    const cle = (e) => { if (e.key === "Escape") { e.stopPropagation(); fin(false); } };
    const head = el("div", "modal-header");
    head.appendChild(el("h3", null, "Doublon possible", "color:#b45309"));
    const x = el("button", "modal-close", "x"); x.onclick = () => fin(false); head.appendChild(x);
    card.appendChild(head);
    card.appendChild(el("p", null, info.titre, "font-size:14px;font-weight:600;margin:0 0 12px"));
    card.appendChild(el("div", null, "Déjà enregistré", "font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#92400e;margin-bottom:6px"));
    const box = el("div", null, null, "background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;padding:10px 12px;margin-bottom:12px;max-height:180px;overflow:auto");
    info.lignes.forEach((l) => box.appendChild(el("div", null, l, "font-size:13px;padding:3px 0;color:#451a03")));
    if (info.reste) box.appendChild(el("div", null, "… et " + info.reste + " autre(s)", "font-size:12px;color:#92400e;padding-top:4px"));
    card.appendChild(box);
    const sa = el("p", null, null, "font-size:13px;margin:0 0 18px;color:#475569");
    sa.appendChild(document.createTextNode("Vous êtes en train de créer : ")); sa.appendChild(el("strong", null, info.saisi));
    card.appendChild(sa);
    const bar = el("div", null, null, "display:flex;gap:10px;justify-content:flex-end");
    const non = el("button", "btn-gray-cancel btn-sm", "Annuler, ne pas créer"); non.onclick = () => fin(false);
    const oui = el("button", "btn-primary", "Créer quand même"); oui.onclick = () => fin(true);
    bar.appendChild(non); bar.appendChild(oui); card.appendChild(bar);
    overlay.appendChild(card);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) fin(false); });
    document.addEventListener("keydown", cle, true);
    document.body.appendChild(overlay);
    non.focus();
  });
}
export const GENRES = { classe: { un: "une", mot: "classe" }, section: { un: "une", mot: "section" }, salle: { un: "une", mot: "salle" } };
export function filtrerNoms(saisi, liste, genre, libelle) {
  const t = [];
  for (const x of liste || []) {
    const n = nomProche(saisi, x.nom);
    if (n) t.push({ niveau: n, libelle: libelle(x) });
  }
  return t.length ? messageClasses(genre, saisi, t) : null;
}
export function filtrerEleves(nom, prenom, liste) {
  const t = [];
  const vus = new Set();
  for (const x of liste || []) {
    const cle = (x.type || "e") + ":" + (x.id || x.matricule || x.nom + x.prenom);
    if (vus.has(cle)) continue; vus.add(cle);
    const n = eleveProche(nom, prenom, x);
    if (n) t.push({ niveau: n, libelle: x.libelle || ((x.matricule ? x.matricule + " " : "") + x.nom + " " + x.prenom) });
  }
  return t.length ? messageEleves(String(nom || "").trim() + " " + String(prenom || "").trim(), t) : null;
}
export const motsRecherche = (nom, prenom) => [...new Set(mots((nom || "") + " " + (prenom || "")).filter((w) => w.length >= 3))].slice(0, 4);

// ---- Web (Supabase) ----
const sansCar = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "");
export async function verifierSection(supabase, nom, anneeId) {
  try {
    const { data } = await supabase.from("sections").select("id, nom").eq("academic_year_uuid", anneeId).is("deleted_at", null);
    return filtrerNoms(nom, data, GENRES.section, (x) => x.nom);
  } catch (e) { return null; }
}
export async function verifierClasse(supabase, nom, anneeId) {
  try {
    const { data } = await supabase.from("classes").select("id, nom, section_uuid").eq("academic_year_uuid", anneeId).is("deleted_at", null);
    const { data: secs } = await supabase.from("sections").select("id, nom").eq("academic_year_uuid", anneeId).is("deleted_at", null);
    const sm = new Map((secs || []).map((s) => [s.id, s.nom]));
    return filtrerNoms(nom, data, GENRES.classe, (x) => x.nom + (sm.get(x.section_uuid) ? " (section " + String(sm.get(x.section_uuid)).trim() + ")" : ""));
  } catch (e) { return null; }
}
export async function verifierSalle(supabase, nom, classeId) {
  try {
    const { data } = await supabase.from("rooms").select("id, nom").eq("class_uuid", classeId).is("deleted_at", null);
    return filtrerNoms(nom, data, GENRES.salle, (x) => x.nom);
  } catch (e) { return null; }
}
export async function verifierEleve(supabase, nom, prenom, anneeId) {
  try {
    const mm = motsRecherche(nom, prenom);
    if (!mm.length) return null;
    const filtre = mm.map((w) => "nom.ilike.%" + w + "%,prenom.ilike.%" + w + "%").join(",");
    const { data } = await supabase.from("students").select("id, matricule, nom, prenom").is("deleted_at", null).or(filtre).limit(400);
    let liste = (data || []).map((x) => ({ ...x, type: "e", libelle: x.matricule + " " + x.nom + " " + x.prenom }));
    if (anneeId) {
      const { data: ins } = await supabase.from("inscriptions").select("id, nom, prenom, statut_inscription").eq("academic_year_uuid", anneeId).is("deleted_at", null).or(filtre).limit(400);
      liste = liste.concat((ins || []).filter((x) => x.statut_inscription !== "refuse").map((x) => ({ ...x, type: "i", libelle: "inscription en cours : " + x.nom + " " + x.prenom })));
    }
    return filtrerEleves(nom, prenom, liste);
  } catch (e) { return null; }
}
