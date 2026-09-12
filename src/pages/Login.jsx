import React, { useState } from "react";
import { useAuth } from "../AuthContext.jsx";

const RAIN_ICONS = ["💰","📊","🎓","📚","💵","⚙️","📈","✏️","🏫","💼","🧮","📐","💳","📁"];

function LoginRain() {
  return (
    <div className="login-rain">
      {RAIN_ICONS.concat(RAIN_ICONS).map((icon, i) => (
        <span
          key={i}
          style={{
            left: ((i * 37) % 92) + "%",
            fontSize: (18 + (i % 4) * 6) + "px",
            animationDuration: (8 + (i % 6) * 1.4) + "s",
            animationDelay: (-(i * 1.1)) + "s"
          }}
        >{icon}</span>
      ))}
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [entering, setEntering] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!username || !password) {
      setError("Veuillez remplir tous les champs");
      return;
    }
    setLoading(true);
    setEntering(true);
    try {
      await login(username, password);
    } catch (e) {
      setEntering(false);
      setError(e.message || "Erreur de connexion");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className={"login-screen" + (entering ? " entering-app" : "")}>
      <LoginRain />
      <div className={"login-flash" + (entering ? " active" : "")} />
      <div className="login-card">
        <div className="login-logo">CAPV</div>
        <h1 className="login-title">CAPV ERP - Web</h1>
        <p className="login-subtitle">Collège Adventiste de Pétion-Ville</p>
        <div className="login-field">
          <label>Identifiant</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Votre identifiant"
            autoFocus
          />
        </div>
        <div className="login-field">
          <label>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Votre mot de passe"
          />
        </div>
        {error && <div className="login-error">{error}</div>}
        <button className="login-button" onClick={handleSubmit} disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
        <p className="login-footer">Worlfinity DevLab - 2026</p>
      </div>
    </div>
  );
}