// Documents imprimables : liste alphabetique des eleves d'une classe (et d'une salle).
import { Erreur } from "./commun.js";
import { elevesDeClasse } from "./h-notes.js";

export function enregistrerDocuments(app) {
  app.get("/api/documents/eleves", async ({ query }, { store }) => {
    if (!query.class_id) throw new Erreur(400, "Classe requise");
    return (await elevesDeClasse(store, query.class_id, query.room_id || null)).map((s) => ({ id: s.id, nom: s.nom, prenom: s.prenom }));
  });
}
