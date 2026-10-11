// Ordre des classes et des sections defini dans Regles academiques (partage par les pages)
// Tri des classes selon l'ordre defini dans Regles academiques (table class_order) ; les autres a la fin, par ordre alphabetique
export async function trierClasses(supabase, liste) {
  try {
    const { data: reglages } = await supabase.from("pedagogie_reglages").select("valeur").eq("cle", "ordre_classes").is("deleted_at", null).limit(1);
    let noms = [];
    try { noms = JSON.parse((reglages && reglages[0] && reglages[0].valeur) || "[]"); } catch (e) { noms = []; }
    const rang = new Map((Array.isArray(noms) ? noms : []).map((n, i) => [String(n || "").trim().toLowerCase(), i + 1]));
    const cle = (c) => { const r = rang.get(String(c.nom || "").trim().toLowerCase()); return r === undefined || Number.isNaN(r) ? Infinity : r; };
    return [...liste].sort((a, b) => {
      const ra = cle(a), rb = cle(b);
      if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
      return String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { numeric: true });
    });
  } catch (e) { return liste; }
}

// Tri des sections : une section prend le rang de sa classe la mieux placee dans l'ordre de Regles academiques
export async function trierSections(supabase, sections, annee) {
  try {
    const { data: reglages } = await supabase.from("pedagogie_reglages").select("valeur").eq("cle", "ordre_classes").is("deleted_at", null).limit(1);
    let noms = [];
    try { noms = JSON.parse((reglages && reglages[0] && reglages[0].valeur) || "[]"); } catch (e) { noms = []; }
    const rang = new Map((Array.isArray(noms) ? noms : []).map((n, i) => [String(n || "").trim().toLowerCase(), i + 1]));
    const { data: cls } = await supabase.from("classes").select("nom, section_uuid").eq("academic_year_uuid", annee.id).is("deleted_at", null);
    const meilleur = new Map();
    for (const c of cls || []) {
      const r = rang.get(String(c.nom || "").trim().toLowerCase());
      if (r === undefined) continue;
      if (!meilleur.has(c.section_uuid) || r < meilleur.get(c.section_uuid)) meilleur.set(c.section_uuid, r);
    }
    const cle = (s) => (meilleur.has(s.id) ? meilleur.get(s.id) : Infinity);
    return [...sections].sort((a, b) => {
      const ra = cle(a), rb = cle(b);
      if (ra !== rb) return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
      return String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { numeric: true });
    });
  } catch (e) { return sections; }
}
