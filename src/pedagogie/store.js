// Acces aux donnees de la pedagogie (Supabase). Meme interface que le faux magasin des tests.
const PAGE = 1000;
const LOT = 120;

function lots(liste) {
  const r = [];
  for (let i = 0; i < liste.length; i += LOT) r.push(liste.slice(i, i + LOT));
  return r;
}

const DRAPEAUX = ["absent", "verrouillee", "est_enseignant", "actif", "rapproche"];
const enBool = (o) => {
  const r = {};
  for (const [k, v] of Object.entries(o || {})) r[k] = DRAPEAUX.includes(k) && (v === 0 || v === 1) ? v === 1 : v;
  return r;
};
const erreurBool = (e) => !!(e && /boolean/i.test(e.message || ""));

export function creerStore(sb, par) {
  const ok = (r, t) => { if (r && r.error) throw new Error((t ? t + " : " : "") + r.error.message); return r; };
  const maintenant = () => new Date().toISOString();

  // o: { cols, eq:{}, neq:{}, in:{col:[...]}, isNull:[], notNull:[], order:[col,...] }
  const inutile = (v) => v === null || v === undefined || v === "null" || v === "undefined";
  async function lire(table, o = {}) {
    // une valeur d'egalite absente ne doit jamais devenir "eq.null" : on lance une erreur claire (avec la table)
    for (const [k, v] of Object.entries({ ...(o.eq || {}), ...(o.neq || {}) })) {
      if (inutile(v)) throw new Error("Valeur manquante pour " + table + "." + k);
    }
    try { return await lireBrut(table, o); }
    catch (e) { if (erreurBool(e) && o.eq) return lireBrut(table, { ...o, eq: enBool(o.eq) }); throw e; }
  }

  async function lireBrut(table, o = {}) {
    const inCol = o.in ? Object.keys(o.in)[0] : null;
    // les valeurs vides (liens non resolus) sont retirees de la liste : jamais envoyees a la base
    const parts = inCol ? lots((o.in[inCol] || []).filter((v) => !inutile(v))) : [null];
    if (inCol && !parts.length) return [];
    let sortie = [];
    for (const lot of parts) {
      for (let de = 0; ; de += PAGE) {
        let q = sb.from(table).select(o.cols || "*");
        for (const [k, v] of Object.entries(o.eq || {})) q = q.eq(k, v);
        for (const [k, v] of Object.entries(o.neq || {})) q = q.neq(k, v);
        for (const k of o.isNull || []) q = q.is(k, null);
        for (const k of o.notNull || []) q = q.not(k, "is", null);
        if (lot) q = q.in(inCol, lot);
        for (const c of o.order || []) q = q.order(c, { ascending: true });
        q = q.order("id", { ascending: true }).range(de, de + PAGE - 1);
        const { data } = ok(await q, table);
        sortie = sortie.concat(data || []);
        if (!data || data.length < PAGE) break;
      }
    }
    return sortie;
  }

  async function inserer(table, ligne) {
    let r = await sb.from(table).insert({ ...ligne, modified_by: par }).select().single();
    if (r.error && erreurBool(r.error)) r = await sb.from(table).insert({ ...enBool(ligne), modified_by: par }).select().single();
    return ok(r).data;
  }

  async function maj(table, id, patch) {
    const { data: cur } = ok(await sb.from(table).select("*").eq("id", id).maybeSingle());
    if (!cur) throw new Error("Enregistrement introuvable");
    const v = { ...patch, last_modified_at: maintenant(), modified_by: par };
    if ("version" in cur) v.version = (cur.version || 1) + 1;
    let r = await sb.from(table).update(v).eq("id", id);
    if (r.error && erreurBool(r.error)) r = await sb.from(table).update(enBool(v)).eq("id", id);
    ok(r);
  }

  return { lire, inserer, maj, maintenant };
}
