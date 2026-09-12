import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

// Modal pour associer un badge existant a un employe : scan webcam (avec choix de camera) ou chargement d'une image (JPEG/PNG)
export default function QrCaptureModal({ title, onCaptured, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const capturedRef = useRef(false);
  const [cameraError, setCameraError] = useState("");
  const [uploadError, setUploadError] = useState("");
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
    if (code && code.data && !capturedRef.current) {
      capturedRef.current = true;
      stopCamera();
      onCaptured(code.data);
    }
  };

  const startCamera = async (deviceId) => {
    setCameraError("");
    stopCamera();
    capturedRef.current = false;
    try {
      const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: { facingMode: "environment" } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanIntervalRef.current = setInterval(scanFrame, 300);
    } catch (e) {
      setCameraError("Impossible d'acceder a la camera. Vous pouvez charger une image a la place.");
    }
  };

  useEffect(() => {
    (async () => {
      await startCamera();
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const cams = list.filter((d) => d.kind === "videoinput");
        setDevices(cams);
        if (cams[0]) setSelectedDevice(cams[0].deviceId);
      } catch (e) {}
    })();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDeviceChange = (id) => {
    setSelectedDevice(id);
    startCamera(id);
  };

  const handleFileUpload = (e) => {
    setUploadError("");
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code && code.data) {
          stopCamera();
          onCaptured(code.data);
        } else {
          setUploadError("Aucun code QR detecte dans cette image. Essayez une image plus nette.");
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "460px", textAlign: "center" }}>
        <div className="modal-header"><h3>{title || "Scanner un badge"}</h3><button className="modal-close" onClick={onClose}>x</button></div>

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
        <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "16px" }}>Presentez le badge devant la camera</p>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "16px", textAlign: "left" }}>
          <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: "10px" }}>Ou chargez directement l'image du QR code (JPEG, PNG)</p>
          {uploadError && <div className="login-error" style={{ marginBottom: "10px" }}>{uploadError}</div>}
          <input type="file" accept="image/*" onChange={handleFileUpload} />
        </div>
      </div>
    </div>
  );
}