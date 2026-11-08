// Admission et refus d'un candidat (partages par la page Inscription et la page Examens d'admission).
//   Les regles sont celles de la page Inscription : fiche complete obligatoire (date, sexe, departement), identifiant normal avec numero d'ordre
//   reserve cote serveur (matricule provisoire si le script SQL n'est pas installe), toutes les informations du candidat recopiees sur la fiche eleve.
//   `examen` (facultatif) = { moyenne, decision: "reussi" | "echoue" } : garde le resultat de l'examen sur l'inscription.
import { debutIdentifiant, matriculePourNouvelEleve } from "./identifiantEleve.js";

function genererMatricule(nom, prenom, seq) {
  const normalize = (str) => (str || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "").toUpperCase();
  let baseNom = normalize(nom).substring(0, 3);
  while (baseNom.length < 3) baseNom += "X";
  const baseP = normalize(prenom).substring(0, 1) || "X";
  return baseNom + baseP + "-" + String(seq).padStart(4, "0");
}

// Ce qui est recopie de l'inscription vers la fiche eleve a l'admission
export const CLES_ELEVE = ["nom", "prenom", "sexe", "adresse", "telephone", "email", "lieu_naissance", "departement_naissance", "commune_naissance", "section_communale", "pays_naissance", "nationalite", "numero_ordre", "numero_identifiant", "nisu", "congregation_religieuse", "rang_famille", "a_handicap", "handicap_besoins", "pere_nom", "pere_prenom", "pere_statut", "pere_occupation", "pere_nif", "pere_telephone", "mere_nom", "mere_prenom", "mere_statut", "mere_occupation", "mere_nif", "mere_telephone", "responsable_lien", "responsable_nom", "responsable_prenom", "responsable_occupation", "responsable_nif", "responsable_ninu", "responsable_email", "responsable_telephone", "responsable_telephone2", "urgence_telephone", "urgence_lien", "ecole_precedente", "classe_precedente", "remarques"];

const infosExamen = (examen) => (examen ? { examen_moyenne: examen.moyenne === null || examen.moyenne === undefined ? null : examen.moyenne, examen_decision: examen.decision, examen_date: new Date().toISOString() } : {});

// Refuse un candidat encore en attente d'examen
export async function refuserInscription(supabase, id, par, examen) {
  const { error } = await supabase.from("inscriptions").update({ statut_inscription: "refuse", modified_by: par || null, ...infosExamen(examen) }).eq("id", id).eq("statut_inscription", "en_attente_examen");
  if (error) throw error;
}

// Admet un candidat en attente : cree la fiche eleve (identifiant normal) puis marque l'inscription comme admise.
// Retourne { student: { id, matricule }, provisoire }.
export async function admettreInscription(supabase, id, par, examen) {
  const { data: ins, error: e0 } = await supabase.from("inscriptions").select("*").eq("id", id).single();
  if (e0) throw e0;
  if (ins.statut_inscription !== "en_attente_examen") throw new Error("Cette inscription a déjà été traitée");
  const d = debutIdentifiant(ins);
  if (!d.complet) throw new Error("Fiche incomplète : il manque " + d.manque.join(", ") + ". Utilise « Modifier » pour la compléter.");
  const nomParent = [ins.responsable_prenom, ins.responsable_nom].filter(Boolean).join(" ") || [ins.pere_prenom, ins.pere_nom].filter(Boolean).join(" ") || [ins.mere_prenom, ins.mere_nom].filter(Boolean).join(" ") || null;
  const telParent = ins.responsable_telephone || ins.pere_telephone || ins.mere_telephone || ins.urgence_telephone || null;
  const ligne = { statut: "actif", modified_by: par || null, date_naissance: ins.date_naissance || null, nom_parent: nomParent, telephone_parent: telParent };
  for (const k of CLES_ELEVE) ligne[k] = ins[k] === undefined || ins[k] === null || ins[k] === "" ? null : ins[k];
  ligne.nom = ins.nom; ligne.prenom = ins.prenom;
  // identifiant normal : le numero d'ordre est reserve sur le serveur (jamais deux fois le meme)
  const { matricule, provisoire } = await matriculePourNouvelEleve(supabase, ligne, async () => {
    const { data: seq, error: eSeq } = await supabase.rpc("next_eleve_seq");
    if (eSeq) throw eSeq;
    return genererMatricule(ins.nom, ins.prenom, seq);
  });
  ligne.matricule = matricule;
  const { data: st, error: e1 } = await supabase.from("students").insert(ligne).select("id, matricule").single();
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("inscriptions").update({ statut_inscription: "admis", student_uuid: st.id, modified_by: par || null, ...infosExamen(examen) }).eq("id", id);
  if (e2) {
    // la fiche eleve vient d'etre creee mais l'inscription n'a pas pu etre marquee : on retire cette fiche pour ne pas laisser un doublon
    try { await supabase.from("students").delete().eq("id", st.id); } catch (e) { /* le message d'erreur d'origine reste le plus utile */ }
    throw e2;
  }
  return { student: st, provisoire };
}
