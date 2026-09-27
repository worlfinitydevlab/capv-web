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
export function calculerReductions(reductions, feesList) {
  const parFrais = {};
  for (const r of reductions) {
    if (r.portee === "ciblee" && r.fee_uuid) {
      const frais = feesList.find((f) => f.id === r.fee_uuid);
      if (!frais) continue;
      let montantRed = 0;
      if (r.type === "exoneration" || r.type === "bourse_complete") montantRed = frais.montant;
      else if (r.type === "demi_bourse") montantRed = frais.montant * 0.5;
      else if (r.mode === "pourcentage") montantRed = frais.montant * (r.valeur / 100);
      else montantRed = Math.min(r.valeur, frais.montant);
      montantRed = Math.round(montantRed);
      parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + montantRed);
    }
  }
  for (const r of reductions) {
    if (r.portee !== "ciblee" && r.mode === "montant" && r.type !== "bourse_complete" && r.type !== "demi_bourse") {
      let reste = r.valeur;
      for (const frais of feesList) {
        if (reste <= 0) break;
        const dejaReduit = parFrais[frais.id] || 0;
        const dispo = frais.montant - dejaReduit;
        const applique = Math.min(reste, dispo);
        parFrais[frais.id] = dejaReduit + applique;
        reste -= applique;
      }
      continue;
    }
    if (r.portee !== "ciblee") {
      for (const frais of feesList) {
        let montantRed = 0;
        if (r.type === "bourse_complete") montantRed = frais.montant;
        else if (r.type === "demi_bourse") montantRed = frais.montant * 0.5;
        else if (r.mode === "pourcentage") montantRed = frais.montant * (r.valeur / 100);
        else continue;
        montantRed = Math.round(montantRed);
        parFrais[frais.id] = Math.min(frais.montant, (parFrais[frais.id] || 0) + montantRed);
      }
    }
  }
  return parFrais;
}

export async function getOrCreateCompteClientUuid(supabase, studentId, nomUtilisateur) {
  const { data: student } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!student) return null;
  if (student.compte_comptable_uuid) return student.compte_comptable_uuid;

  const compteParentId = await getCompteComptableByNumero(supabase, "1100");
  const { data: enfants } = await supabase.from("comptes_comptables").select("numero").eq("compte_parent_uuid", compteParentId);
  let maxSeq = 0;
  (enfants || []).forEach((e) => { const parts = e.numero.split("."); if (parts.length === 2) { const n = parseInt(parts[1]); if (n > maxSeq) maxSeq = n; } });
  const numero = "1100." + (maxSeq + 1);
  const { data: compte, error: eCompte } = await supabase.from("comptes_comptables").insert({ numero, nom: student.prenom + " " + student.nom, type: "actif", compte_parent_uuid: compteParentId, modified_by: nomUtilisateur }).select().single();
  if (eCompte) return null;
  await supabase.from("students").update({ compte_comptable_uuid: compte.id }).eq("id", studentId);
  return compte.id;
}

export async function genererFacturesEleve(supabase, { studentId, classUuid, academicYearId, nomUtilisateur, userUuid }) {
  const { data: student } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!student) return [];

  const compteClientUuid = await getOrCreateCompteClientUuid(supabase, studentId, nomUtilisateur);
  if (!compteClientUuid) return [];

  const { data: fees } = await supabase.from("class_fees").select("*").eq("class_uuid", classUuid);
  const feesList = fees || [];
  if (feesList.length === 0) return [];

  const { data: reds } = await supabase.from("reductions").select("*").eq("student_uuid", studentId).eq("statut", "active");
  const filteredReds = (reds || []).filter((r) => !r.academic_year_uuid || r.academic_year_uuid === academicYearId);
  const redParFrais = calculerReductions(filteredReds, feesList);

  const { count } = await supabase.from("client_factures").select("id", { count: "exact", head: true });
  const yr = new Date().getFullYear();
  const dateFacture = new Date().toISOString().slice(0, 10);
  const compte2200Uuid = await getCompteComptableByNumero(supabase, "2200");
  const compte4500Uuid = await getCompteComptableByNumero(supabase, "4500");
  const factureIds = [];
  let seq = count || 0;

  for (const fee of feesList) {
    seq++;
    const numero = "FC-" + yr + "-" + String(seq).padStart(4, "0");
    const montantBrut = fee.montant;
    const reduction = redParFrais[fee.id] || 0;
    const montantNet = Math.max(0, montantBrut - reduction);

    const { data: facture, error: eFact } = await supabase.from("client_factures").insert({
      numero, student_uuid: studentId, class_fee_uuid: fee.id, academic_year_uuid: academicYearId,
      nom: fee.nom, date_facture: dateFacture, date_echeance: fee.date_echeance || null,
      montant_brut: montantBrut, reduction, montant_net: montantNet,
      statut: montantNet <= 0 ? "payee" : "impayee", revenu_reconnu: false,
      nom_utilisateur: nomUtilisateur, modified_by: nomUtilisateur
    }).select().single();
    if (eFact) continue;

    await genererEcritureAutomatique(supabase, {
      date_ecriture: dateFacture,
      description: "Facturation " + fee.nom + " - " + numero,
      origine_type: "client_facture", origine_id: facture.id,
      compte_debit_uuid: compteClientUuid, compte_credit_uuid: compte2200Uuid,
      montant: montantBrut, user_uuid: userUuid || null, nom_utilisateur: nomUtilisateur, modified_by: nomUtilisateur
    });

    if (reduction > 0 && compte4500Uuid) {
      await genererEcritureAutomatique(supabase, {
        date_ecriture: dateFacture,
        description: "Reduction/bourse - " + numero,
        origine_type: "client_facture_reduction", origine_id: facture.id,
        compte_debit_uuid: compte4500Uuid, compte_credit_uuid: compteClientUuid,
        montant: reduction, user_uuid: userUuid || null, nom_utilisateur: nomUtilisateur, modified_by: nomUtilisateur
      });
    }
    factureIds.push(facture.id);
  }
  return factureIds;
}

export async function getOrCreateCompteFournisseurUuid(supabase, fournisseurId, nomUtilisateur) {
  const { data: fournisseur } = await supabase.from("suppliers").select("*").eq("id", fournisseurId).maybeSingle();
  if (!fournisseur) return null;
  if (fournisseur.compte_comptable_uuid) return fournisseur.compte_comptable_uuid;

  const compteParentId = await getCompteComptableByNumero(supabase, "2100");
  const { data: enfants } = await supabase.from("comptes_comptables").select("numero").eq("compte_parent_uuid", compteParentId);
  let maxSeq = 0;
  (enfants || []).forEach((e) => { const parts = e.numero.split("."); if (parts.length === 2) { const n = parseInt(parts[1]); if (n > maxSeq) maxSeq = n; } });
  const numero = "2100." + (maxSeq + 1);
  const { data: compte, error: eCompte } = await supabase.from("comptes_comptables").insert({ numero, nom: fournisseur.nom, type: "passif", compte_parent_uuid: compteParentId, modified_by: nomUtilisateur }).select().single();
  if (eCompte) return null;
  await supabase.from("suppliers").update({ compte_comptable_uuid: compte.id }).eq("id", fournisseurId);
  return compte.id;
}