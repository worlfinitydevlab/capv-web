import React, { useState, useEffect, useRef } from "react";
import jsQR from "jsqr";
import bcrypt from "bcryptjs";
import { useAuth } from "../AuthContext.jsx";
import { getAuthedClient } from "../supabaseClient.js";

// Modal reutilisable pour identifier un employe (badge QR via webcam, ou matricule + code)
// sans passer par un compte utilisateur complet. Utilise pour confirmer les livraisons,
// les receptions de commande et les receptions de demandes internes.
export default function EmployeeVerifyModal({ title, summary, requiredFonction, onVerified, onClose }) {
  const { token } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const [mode, setMode] = useState("qr");
  const [matricule, setMatricule] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("");

  const stopCamera = () => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code && code.data) verifyQr(code.data);
  };

  const startCamera = async (deviceId) => {
    setCameraError("");
    stopCamera();
    try {
      const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: { facingMode: "environment" } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanIntervalRef.current = setInterval(scanFrame, 300);
      if (devices.length === 0) {
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          const cams = list.filter((d) => d.kind === "videoinput");
          setDevices(cams);
          if (!selectedDevice && cams[0]) setSelectedDevice(cams[0].deviceId);
        } catch (e) {}
      }
    } catch (e) {
      setCameraError("Impossible d'acceder a la camera. Utilisez le code a la place.");
      setMode("pin");
    }
  };

  useEffect(() => {
    if (mode === "qr") startCamera(selectedDevice || undefined);
    else stopCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const onDeviceChange = (id) => {
    setSelectedDevice(id);
    startCamera(id);
  };

  const checkFonction = (emp) => {
    if (requiredFonction && (emp.fonction || "").toLowerCase().trim() !== String(requiredFonction).toLowerCase().trim()) {
      setError(emp.nom + " n'est pas enregistre comme " + requiredFonction + ".");
      return false;
    }
    return true;
  };

  const verifyQr = async (qrValue) => {
    if (busy) return;
    setBusy(true);
    stopCamera();
    setError("");
    try {
      const supabase = getAuthedClient(token);
      const { data: emp } = await supabase.from("employees").select("*").eq("qr_value", qrValue).eq("statut", "actif").maybeSingle();
      if (!emp) {
        setError("Badge non reconnu");
        setBusy(false);
        startCamera(selectedDevice || undefined);
        return;
      }
      if (!checkFonction(emp)) {
        setBusy(false);
        startCamera(selectedDevice || undefined);
        return;
      }
      onVerified({ id: emp.id, matricule: emp.matricule, nom: emp.nom, fonction: emp.fonction });
    } catch (e) {
      setError("Erreur de connexion");
      setBusy(false);
      startCamera(selectedDevice || undefined);
    }
  };

  const verifyPin = async () => {
    setError("");
    if (!matricule || !pin) { setError("Matricule et code requis"); return; }
    setBusy(true);
    try {
      const supabase = getAuthedClient(token);
      const { data: emp } = await supabase.from("employees").select("*").eq("matricule", matricule).eq("statut", "actif").maybeSingle();
      setBusy(false);
      if (!emp) { setError("Employe introuvable"); return; }
      if (!emp.pin_hash || !bcrypt.compareSync(pin, emp.pin_hash)) { setError("Code incorrect"); return; }
      if (!checkFonction(emp)) return;
      onVerified({ id: emp.id, matricule: emp.matricule, nom: emp.nom, fonction: emp.fonction });
    } catch (e) {
      setBusy(false);
      setError("Erreur de connexion");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "440px", textAlign: "center" }}>
        <div className="modal-header"><h3>{title || "Identification employe"}</h3><button className="modal-close" onClick={onClose}>x</button></div>

        {summary && <div style={{ background: "var(--bg-soft)", borderRadius: "10px", padding: "14px", marginBottom: "16px", textAlign: "left" }}>{summary}</div>}

        <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "16px" }}>
          <button className={"btn-sm " + (mode === "qr" ? "btn-primary" : "btn-gray-cancel")} onClick={() => setMode("qr")}>Scanner le badge</button>
          <button className={"btn-sm " + (mode === "pin" ? "btn-primary" : "btn-gray-cancel")} onClick={() => setMode("pin")}>Matricule + code</button>
        </div>

        {error && <div className="login-error" style={{ marginBottom: "14px" }}>{error}</div>}

        {mode === "qr" && (
          <div>
            {devices.length > 1 && (
              <div className="form-group" style={{ marginBottom: "12px", textAlign: "left" }}>
                <label>Camera</label>
                <select value={selectedDevice} onChange={(e) => onDeviceChange(e.target.value)}>
                  {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Camera " + (i + 1)}</option>)}
                </select>
              </div>
            )}
            {cameraError && <div className="login-error" style={{ marginBottom: "14px" }}>{cameraError}</div>}
            <div style={{ borderRadius: "12px", overflow: "hidden", background: "#000", marginBottom: "12px" }}>
              <video ref={videoRef} style={{ width: "100%", display: "block" }} muted playsInline />
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>Presentez le badge devant la camera</p>
          </div>
        )}

        {mode === "pin" && (
          <div style={{ textAlign: "left" }}>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label>Matricule</label>
              <input value={matricule} onChange={(e) => setMatricule(e.target.value)} autoFocus />
            </div>
            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label>Code</label>
              <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && verifyPin()} />
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button className="btn-gray-cancel btn-sm" onClick={onClose}>Annuler</button>
              <button className="btn-primary" onClick={verifyPin} disabled={busy}>Confirmer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}