export async function getCompteComptableByNumero(supabase, numero) {
  const { data } = await supabase.from("comptes_comptables").select("id").eq("numero", numero).maybeSingle();
  return data ? data.id : null;
}

export async function genererEcritureAutomatique(supabase, params) {
  const { date_ecriture, description, origine_type, origine_id, compte_debit_uuid, compte_credit_uuid, montant, user_uuid, nom_utilisateur, modified_by } = params;
  if (!compte_debit_uuid || !compte_credit_uuid || !montant) return null;
  const { data: ecriture, error: e1 } = await supabase.from("ecritures_comptables").insert({
    date_ecriture, description: description || null, origine_type: origine_type || null, origine_id: origine_id || null,
    user_uuid: user_uuid || null, nom_utilisateur: nom_utilisateur || null, modified_by: modified_by || null
  }).select().single();
  if (e1) { console.error("Erreur creation ecriture:", e1); return null; }
  const { error: e2 } = await supabase.from("lignes_ecriture").insert([
    { ecriture_uuid: ecriture.id, compte_uuid: compte_debit_uuid, debit: montant, credit: 0, modified_by: modified_by || null },
    { ecriture_uuid: ecriture.id, compte_uuid: compte_credit_uuid, debit: 0, credit: montant, modified_by: modified_by || null }
  ]);
  if (e2) { console.error("Erreur creation lignes ecriture:", e2); return null; }
  return ecriture.id;
}

export async function getCompteComptablePourType(supabase, type, compteUuid) {
  if (type === "grande") return getCompteComptableByNumero(supabase, "1010");
  if (type === "petite") return getCompteComptableByNumero(supabase, "1011");
  if (type === "sous_caisse") {
    const { data } = await supabase.from("sous_caisses").select("compte_comptable_uuid").eq("id", compteUuid).maybeSingle();
    return data ? data.compte_comptable_uuid : null;
  }
  if (type === "banque") {
    const { data } = await supabase.from("comptes_bancaires").select("compte_comptable_uuid").eq("id", compteUuid).maybeSingle();
    return data ? data.compte_comptable_uuid : null;
  }
  return null;
}

export async function genererEcritureTransfert(supabase, transfert) {
  const compteDebit = await getCompteComptablePourType(supabase, transfert.destination_type, transfert.destination_compte_uuid);
  const compteCredit = await getCompteComptablePourType(supabase, transfert.source_type, transfert.source_compte_uuid);
  return genererEcritureAutomatique(supabase, {
    date_ecriture: (transfert.created_at || new Date().toISOString()).slice(0, 10),
    description: "Transfert interne - " + (transfert.motif || transfert.reference || ("#" + transfert.id)),
    origine_type: "transfert_interne", origine_id: transfert.id,
    compte_debit_uuid: compteDebit, compte_credit_uuid: compteCredit,
    montant: transfert.montant,
    user_uuid: transfert.user_uuid || null, nom_utilisateur: transfert.nom_utilisateur, modified_by: transfert.modified_by
  });
}

export async function getSousCaisseCompteComptable(supabase, sousCaisseUuid) {
  if (!sousCaisseUuid) return null;
  const { data } = await supabase.from("sous_caisses").select("compte_comptable_uuid").eq("id", sousCaisseUuid).maybeSingle();
  return data ? data.compte_comptable_uuid : null;
}

export async function genererEcritureEncaissement(supabase, params) {
  const { sousCaisseUuid, compteProduitNumero, montant, origine_type, origine_id, description, user_uuid, nom_utilisateur, modified_by, date_ecriture } = params;
  const compteDebit = await getSousCaisseCompteComptable(supabase, sousCaisseUuid);
  const compteCredit = await getCompteComptableByNumero(supabase, compteProduitNumero);
  return genererEcritureAutomatique(supabase, {
    date_ecriture: date_ecriture || new Date().toISOString().slice(0, 10),
    description, origine_type, origine_id,
    compte_debit_uuid: compteDebit, compte_credit_uuid: compteCredit,
    montant, user_uuid, nom_utilisateur, modified_by
  });
}

export async function genererEcritureDecaissement(supabase, exp) {
  const compteCredit = exp.caisse_type === "grande"
    ? await getCompteComptableByNumero(supabase, "1010")
    : await getCompteComptableByNumero(supabase, "1011");
  const compteDebit = await getCompteComptableByNumero(supabase, "5200");
  return genererEcritureAutomatique(supabase, {
    date_ecriture: new Date().toISOString().slice(0, 10),
    description: "Decaissement - " + exp.categorie + (exp.numero_cheque ? " (cheque " + exp.numero_cheque + ")" : ""),
    origine_type: "expense", origine_id: exp.id,
    compte_debit_uuid: compteDebit, compte_credit_uuid: compteCredit,
    montant: exp.montant,
    user_uuid: null, nom_utilisateur: exp.modified_by, modified_by: exp.modified_by
  });
}

export async function genererEcritureFactureFournisseur(supabase, facture) {
  const compteDebit = await getCompteComptableByNumero(supabase, "5200");
  return genererEcritureAutomatique(supabase, {
    date_ecriture: facture.date_facture,
    description: "Facture fournisseur " + facture.numero + (facture.description ? " - " + facture.description : ""),
    origine_type: "fournisseur_facture", origine_id: facture.id,
    compte_debit_uuid: compteDebit, compte_credit_uuid: facture.compte_fournisseur_uuid,
    montant: facture.montant_total,
    user_uuid: facture.user_uuid || null, nom_utilisateur: facture.nom_utilisateur, modified_by: facture.nom_utilisateur
  });
}

export async function genererEcriturePaiementFournisseur(supabase, paiement) {
  const compteCredit = await getCompteComptableByNumero(supabase, "1010");
  return genererEcritureAutomatique(supabase, {
    date_ecriture: new Date().toISOString().slice(0, 10),
    description: "Paiement fournisseur " + paiement.numero + (paiement.numero_cheque ? " (cheque " + paiement.numero_cheque + ")" : ""),
    origine_type: "fournisseur_paiement", origine_id: paiement.id,
    compte_debit_uuid: paiement.compte_fournisseur_uuid, compte_credit_uuid: compteCredit,
    montant: paiement.montant,
    user_uuid: null, nom_utilisateur: paiement.modified_by, modified_by: paiement.modified_by
  });
}

export async function genererEcritureAjustementBancaire(supabase, ajustement) {
  const compteDebit = await getCompteComptableByNumero(supabase, "5200");
  const compteCredit = await getCompteComptablePourType(supabase, "banque", ajustement.compte_bancaire_uuid);
  return genererEcritureAutomatique(supabase, {
    date_ecriture: ajustement.date,
    description: "Frais bancaire - " + ajustement.description,
    origine_type: "ajustement_bancaire", origine_id: ajustement.id,
    compte_debit_uuid: compteDebit, compte_credit_uuid: compteCredit,
    montant: ajustement.montant,
    user_uuid: null, nom_utilisateur: ajustement.modified_by, modified_by: ajustement.modified_by
  });
}

export async function genererEcritureAcquisitionImmobilisation(supabase, imm) {
  const compteDebit = await getCompteComptableByNumero(supabase, "1500");
  const compteCredit = await getCompteComptableByNumero(supabase, "1010");
  return genererEcritureAutomatique(supabase, {
    date_ecriture: imm.date_acquisition,
    description: "Acquisition immobilisation - " + imm.nom,
    origine_type: "immobilisation", origine_id: imm.id,
    compte_debit_uuid: compteDebit, compte_credit_uuid: compteCredit,
    montant: imm.valeur_acquisition,
    user_uuid: null, nom_utilisateur: imm.modified_by, modified_by: imm.modified_by
  });
}

export async function genererEcritureAmortissement(supabase, amort) {
  const compteDebit = await getCompteComptableByNumero(supabase, "5900");
  const compteCredit = await getCompteComptableByNumero(supabase, "1590");
  return genererEcritureAutomatique(supabase, {
    date_ecriture: amort.date,
    description: "Dotation aux amortissements " + amort.annee + " - " + amort.nom_immobilisation,
    origine_type: "amortissement", origine_id: amort.id,
    compte_debit_uuid: compteDebit, compte_credit_uuid: compteCredit,
    montant: amort.montant,
    user_uuid: null, nom_utilisateur: amort.modified_by, modified_by: amort.modified_by
  });
}