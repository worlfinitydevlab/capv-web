// Moteur de la pedagogie cote web : reproduit les routes /api/... du poste de travail au-dessus de Supabase.
import { Erreur, creerOutils } from "./commun.js";
import { enregistrerMatieres } from "./h-matieres.js";
import { enregistrerNotes } from "./h-notes.js";
import { enregistrerRegles } from "./h-regles.js";
import { enregistrerDocuments } from "./h-documents.js";

// module de permission selon l'adresse (meme logique que le poste de travail)
export function moduleDeChemin(chemin) {
  if (/^\/api\/(matieres|matieres-classe|categories-matieres|enseignants)(\/|$)/.test(chemin)) return "matieres";
  if (/^\/api\/(regles|ordre-classes|promotion)(\/|$)/.test(chemin)) return "regles-academiques";
  if (/^\/api\/documents(\/|$)/.test(chemin)) return "documents-imprimables";
  if (/^\/api\/saisie(\/|$)/.test(chemin)) return "saisie-notes";
  return "notes";
}

const ACTION = { POST: "creer", PUT: "modifier", DELETE: "annuler" };
// zones dont toute ecriture demande le mot de passe
const A_MOT_DE_PASSE = /^\/api\/(matieres|matieres-classe|categories-matieres|enseignants|periodes|evaluations|notes|pedagogie|regles|ordre-classes|promotion)(\/|$)/;

export function creerMoteur(store, ctx) {
  const routes = [];
  const ajouter = (methode, modele, fn) => {
    const noms = [];
    const re = new RegExp("^" + modele.replace(/:(\w+)/g, (_, n) => { noms.push(n); return "([^/]+)"; }) + "/?$");
    routes.push({ methode, re, noms, fn });
  };
  const app = {
    get: (m, f) => ajouter("GET", m, f), post: (m, f) => ajouter("POST", m, f),
    put: (m, f) => ajouter("PUT", m, f), delete: (m, f) => ajouter("DELETE", m, f)
  };
  const outils = creerOutils(store);
  const aide = { store, ctx, outils };

  async function authentifier(corps, module, methode) {
    const u = ctx.utilisateur();
    if (!u) throw new Erreur(401, "Session expirée : reconnecte-toi.");
    const action = ACTION[methode] || "modifier";
    if (!ctx.peut(module, action)) throw new Erreur(403, "Tu n'as pas la permission d'effectuer cette action.");
    const nom = String((corps && corps.auth_username) || "").trim();
    const mdp = String((corps && corps.auth_password) || "");
    if (!nom || !mdp) throw new Erreur(401, "Mot de passe requis pour cette action.");
    if (nom.toLowerCase() !== String(u.username || "").toLowerCase()) throw new Erreur(401, "L'identifiant doit être celui de la session ouverte.");
    await ctx.verifier(nom, mdp); // lance une Erreur 401 si faux
    return u;
  }

  async function auditer(u, methode, chemin, corps) {
    try {
      const d = { ...(corps || {}) };
      delete d.auth_username; delete d.auth_password;
      await store.inserer("audit_pedagogie", { username: u.username, action: methode + " " + chemin, details: JSON.stringify(d).slice(0, 2000) });
    } catch (e) { /* le journal ne doit jamais bloquer l'action */ }
  }

  async function traiter(methode, url, corps) {
    methode = String(methode || "GET").toUpperCase();
    const [chemin, qs] = String(url).split("?");
    // les valeurs "null", "undefined" ou vides (page pas encore prete) sont ignorees : jamais envoyees a la base
    const query = Object.fromEntries([...new URLSearchParams(qs || "")].filter(([, v]) => v !== "" && v !== "null" && v !== "undefined"));
    try {
      if (methode === "POST" && chemin === "/api/securite/verifier") {
        const u = ctx.utilisateur();
        if (!u) throw new Erreur(401, "Session expirée : reconnecte-toi.");
        const nom = String((corps && corps.username) || "").trim();
        if (nom.toLowerCase() !== String(u.username || "").toLowerCase()) throw new Erreur(401, "L'identifiant doit être celui de la session ouverte.");
        const m = (corps && corps.module) || "notes";
        if (!(ctx.peut(m, "creer") || ctx.peut(m, "modifier") || ctx.peut(m, "annuler"))) throw new Erreur(403, "Tu n'as pas la permission d'effectuer cette action.");
        await ctx.verifier(nom, String((corps && corps.password) || ""));
        return { status: 200, data: { success: true } };
      }
      const r = routes.find((x) => x.methode === methode && x.re.test(chemin));
      if (!r) return { status: 404, data: { error: "Route inconnue : " + methode + " " + chemin } };
      const m = chemin.match(r.re);
      const params = {};
      r.noms.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      let user = null;
      if (methode !== "GET" && A_MOT_DE_PASSE.test(chemin)) {
        user = await authentifier(corps, moduleDeChemin(chemin), methode);
        corps = { ...(corps || {}) };
        delete corps.auth_username; delete corps.auth_password;
      }
      const data = await r.fn({ params, query, body: corps || {} }, aide);
      if (user) await auditer(user, methode, chemin, corps);
      return { status: 200, data: data === undefined ? { success: true } : data };
    } catch (e) {
      if (e instanceof Erreur) return { status: e.status, data: { error: e.message, ...e.extra } };
      return { status: 500, data: { error: e && e.message ? e.message : String(e) } };
    }
  }

  enregistrerMatieres(app);
  enregistrerNotes(app);
  enregistrerRegles(app);
  enregistrerDocuments(app);
  return { traiter, app };
}
