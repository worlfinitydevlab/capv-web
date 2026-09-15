import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

const TYPES_PIECES = {
  facture: "Facture",
  recu: "Recu",
  cheque: "Cheque",
  bon_sortie: "Bon de sortie",
  bon_commande: "Bon de commande",
  contrat: "Contrat",
  releve_bancaire: "Releve bancaire",
  document_administratif: "Document administratif",
  autre: "Autre document"
};

export default function PiecesJustificatives({ operationType, operationUuid, compact }) {
  const { token, user } = useAuth();
  const [pieces, setPieces] = useState([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ type_piece: "recu", description: "" });
  const fileInputRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);

  const load = async () => {
    if (!token || !operationUuid) return;
    const supabase = getAuthedClient(token);
    const { data } = await supabase.from("pieces_justificatives").select("*").eq("operation_type", operationType).eq("operation_uuid", operationUuid).order("created_at", { ascending: false });
    setPieces(data || []);
  };
  useEffect(() => { load(); }, [token, operationType, operationUuid]);

  const onFileSelected = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setError("");
    setAddOpen(true);
  };

  const submit = async () => {
    if (!pendingFile) { setError("Choisissez un fichier"); return; }
    setError("");
    setUploading(true);
    try {
      const supabase = getAuthedClient(token);
      const ext = pendingFile.name.split(".").pop();
      const filePath = operationType + "-" + operationUuid + "-" + Date.now() + "." + ext;
      const { error: upErr } = await supabase.storage.from("pieces-justificatives").upload(filePath, pendingFile, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("pieces-justificatives").getPublicUrl(filePath);
      const { error: e } = await supabase.from("pieces_justificatives").insert({
        type_piece: form.type_piece, description: form.description || null,
        fichier_url: urlData.publicUrl, fichier_nom: pendingFile.name,
        operation_type: operationType, operation_uuid: operationUuid,
        user_uuid: user.id, nom_utilisateur: user.nom_complet || user.username,
        modified_by: user.username
      });
      if (e) throw e;
      setAddOpen(false);
      setForm({ type_piece: "recu", description: "" });
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e) {
      setError(e.message || "Erreur lors de l'envoi");
    }
    setUploading(false);
  };

  const remove = async (id) => {
    if (!confirm("Supprimer cette piece jointe ?")) return;
    const supabase = getAuthedClient(token);
    await supabase.from("pieces_justificatives").delete().eq("id", id);
    load();
  };

  return (
    <div style={{ marginTop: compact ? "8px" : "16px" }}>
      {!compact && <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "var(--text-dim)", marginBottom: "8px" }}>Pieces justificatives</label>}
      {error && <div className="login-error" style={{ marginBottom: "10px", fontSize: "12px" }}>{error}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
        {pieces.length === 0 && <p style={{ fontSize: "12px", color: "var(--text-soft)", fontStyle: "italic" }}>Aucune piece jointe.</p>}
        {pieces.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-soft)", borderRadius: "8px", fontSize: "12px" }}>
            <a href={p.fichier_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
              <strong>{TYPES_PIECES[p.type_piece] || p.type_piece}</strong>{p.description ? " - " + p.description : ""}
            </a>
            <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", color: "var(--err)", cursor: "pointer", fontSize: "12px" }}>Suppr.</button>
          </div>
        ))}
      </div>
      <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={onFileSelected} />
      <button className="btn-sm btn-gray-cancel" onClick={() => fileInputRef.current.click()}>+ Ajouter une piece</button>

      {addOpen && (
        <div className="modal-overlay" onClick={() => setAddOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "400px" }}>
            <div className="modal-header"><h3>Ajouter une piece justificative</h3><button className="modal-close" onClick={() => setAddOpen(false)}>x</button></div>
            {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "14px" }}>Fichier : <strong>{pendingFile ? pendingFile.name : ""}</strong></p>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Type de piece</label>
              <select value={form.type_piece} onChange={(e) => setForm({ ...form, type_piece: e.target.value })}>
                {Object.entries(TYPES_PIECES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Description (optionnel)</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={() => setAddOpen(false)}>Annuler</button>
              <button className="btn-primary" onClick={submit} disabled={uploading}>{uploading ? "Envoi..." : "Ajouter"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}