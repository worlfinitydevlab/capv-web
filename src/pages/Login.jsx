import React, { useState } from "react";
import { useAuth } from "../AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!username || !password) {
      setError("Veuillez remplir tous les champs");
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
    } catch (e) {
      setError(e.message || "Erreur de connexion");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">CAPV</div>
        <h1 className="login-title">CAPV ERP - Web</h1>
        <p className="login-subtitle">College Adventiste de Petion-Ville</p>
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