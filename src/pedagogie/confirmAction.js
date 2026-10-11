// Confirmation par mot de passe pour toute modification (ajout, changement, suppression) des modules pedagogie.
// Fenetre construite en DOM pur : aucune dependance, utilisable depuis n'importe quelle page.
let utilisateur = null;
let dernier = null; // identifiants valides, reutilises 60 s uniquement pour la 2e etape d'une meme action (confirmation serveur)

export function definirUtilisateur(u) {
  if (u && u.username) utilisateur = u.username;
}

const OBJETS = [
  [/^\/api\/ordre-classes/, "l'ordre des classes"],
  [/^\/api\/regles\/modele/, "la règle modèle de décision"],
  [/^\/api\/regles/, "une règle de décision académique"],
  [/^\/api\/promotion/, "une décision de promotion"],
  [/^\/api\/matieres-classe\/copier-annee/, "les affectations de matières d'une autre année"],
  [/^\/api\/matieres-classe/, "une affectation de matière à une classe"],
  [/^\/api\/matieres/, "une matière du catalogue"],
  [/^\/api\/categories-matieres/, "une catégorie de matières"],
  [/^\/api\/enseignants/, "un enseignant"],
  [/^\/api\/periodes\/[^/]+\/poids/, "le poids d'une période"],
  [/^\/api\/periodes\/copier-annee/, "les périodes d'une autre année"],
  [/^\/api\/periodes/, "une période d'examen"],
  [/^\/api\/evaluations\/[^/]+\/notes/, "des notes"],
  [/^\/api\/evaluations/, "une évaluation"],
  [/^\/api\/pedagogie\/parametres/, "les paramètres pédagogiques"]
];

export function libelleAction(methode, url) {
  const u = String(url).split("?")[0];
  const verbe = methode === "DELETE" ? "Supprimer" : methode === "POST" ? "Ajouter / enregistrer" : "Modifier";
  for (const [re, objet] of OBJETS) if (re.test(u)) return verbe + " " + objet;
  return verbe + " des données";
}

export function moduleDeUrl(url) {
  if (/^\/api\/(regles|ordre-classes|promotion)/.test(String(url))) return "regles-academiques";
  return /^\/api\/(matieres|matieres-classe|categories-matieres|enseignants)/.test(String(url)) ? "matieres" : "notes";
}

function el(tag, props, enfants) {
  const n = document.createElement(tag);
  Object.assign(n, props || {});
  (enfants || []).forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}

export function demanderConfirmation(libelle, module) {
  return new Promise((resolve) => {
    const overlay = el("div", { className: "modal-overlay" });
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center";
    const carte = el("div", { className: "modal-card" });
    carte.style.cssText = "background:var(--card-bg,#1e222b);color:var(--text,#eee);border:1px solid var(--border,rgba(255,255,255,0.15));border-radius:14px;padding:22px 24px;";
    carte.style.width = "420px";
    carte.style.maxWidth = "92vw";

    const titre = el("h3", { textContent: "Confirmation requise" });
    titre.style.color = "var(--err, #c33)";
    const boite = el("div", {}, [
      el("p", {}, [el("strong", { textContent: "Action : " }), libelle]),
      el("p", { textContent: "Entrez votre mot de passe pour confirmer. Cette action sera enregistrée dans le journal." })
    ]);
    boite.style.cssText = "background:rgba(220,60,60,0.08);border:1px solid rgba(220,60,60,0.35);border-radius:10px;padding:12px 14px;margin:12px 0 16px;font-size:13px";
    boite.querySelectorAll("p").forEach((p) => { p.style.margin = "4px 0"; });

    const erreur = el("div", { className: "login-error" });
    erreur.style.display = "none";
    erreur.style.marginBottom = "12px";

    const champId = el("input", { type: "text", value: utilisateur || "", placeholder: "Identifiant", readOnly: !!utilisateur });
    const champMdp = el("input", { type: "password", placeholder: "Mot de passe", autocomplete: "current-password" });
    const g1 = el("div", { className: "form-group" }, [el("label", { textContent: "Identifiant" }), champId]);
    const g2 = el("div", { className: "form-group" }, [el("label", { textContent: "Mot de passe" }), champMdp]);
    g1.style.marginBottom = "12px"; g2.style.marginBottom = "18px";

    const bAnnuler = el("button", { className: "btn-gray-cancel btn-sm", textContent: "Annuler", type: "button" });
    const bOk = el("button", { className: "btn-primary", textContent: "Confirmer", type: "button" });
    const pied = el("div", {}, [bAnnuler, bOk]);
    pied.style.cssText = "display:flex;gap:10px;justify-content:flex-end";

    carte.appendChild(titre); carte.appendChild(boite); carte.appendChild(erreur);
    carte.appendChild(g1); carte.appendChild(g2); carte.appendChild(pied);
    overlay.appendChild(carte);
    document.body.appendChild(overlay);
    (utilisateur ? champMdp : champId).focus();

    let ferme = false;
    const fermer = (valeur) => {
      if (ferme) return;
      ferme = true;
      document.removeEventListener("keydown", touches, true);
      overlay.remove();
      resolve(valeur);
    };
    const touches = (e) => { if (e.key === "Escape") { e.stopPropagation(); fermer(null); } };
    document.addEventListener("keydown", touches, true);

    const valider = async () => {
      erreur.style.display = "none";
      if (!champId.value.trim() || !champMdp.value) { erreur.textContent = "Identifiant et mot de passe requis"; erreur.style.display = "block"; return; }
      bOk.disabled = true; bOk.textContent = "Vérification...";
      try {
        const r = await fetch("/api/securite/verifier", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: champId.value.trim(), password: champMdp.value, module })
        });
        let d = {};
        try { d = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error(d.error || "Vérification échouée");
        fermer({ username: champId.value.trim(), password: champMdp.value });
      } catch (e) {
        erreur.textContent = e.message; erreur.style.display = "block";
        bOk.disabled = false; bOk.textContent = "Confirmer";
        champMdp.value = ""; champMdp.focus();
      }
    };
    bOk.onclick = valider;
    bAnnuler.onclick = () => fermer(null);
    overlay.onclick = (e) => { if (e.target === overlay) fermer(null); };
    champMdp.onkeydown = (e) => { if (e.key === "Enter") valider(); };
    champId.onkeydown = (e) => { if (e.key === "Enter") champMdp.focus(); };
  });
}

// Renvoie { username, password } ou null si l'utilisateur annule.
export async function authPourAction(methode, url, corps) {
  const suite = (corps && corps.confirmer) || /[?&]confirmer=1/.test(String(url));
  if (suite && dernier && Date.now() - dernier.t < 60000) return dernier;
  const a = await demanderConfirmation(libelleAction(methode, url), moduleDeUrl(url));
  dernier = a ? { ...a, t: Date.now() } : null;
  return dernier;
}
