import React from "react";
import { useAuth } from "../AuthContext.jsx";

// Affiche a la place d'une page dont le role n'a pas le droit "voir".
// Pour le tableau de bord, c'est un simple accueil (le role n'a pas de tableau de bord dans cet espace).
export default function AccesRefuse({ accueil }) {
  const { user } = useAuth();
  const nom = user ? (user.nom_complet || user.username || "") : "";
  if (accueil) {
    return (
      <div className="page">
        <div className="dash-placeholder">
          <h2 style={{ marginBottom: "8px" }}>{nom ? "Bienvenue, " + nom : "Bienvenue"}</h2>
          <p>Choisis un élément dans le menu à gauche pour commencer.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="dash-placeholder">
        <h2 style={{ marginBottom: "8px" }}>Accès non autorisé</h2>
        <p>Ton rôle n'a pas le droit d'ouvrir cette page. Si tu en as besoin, demande à l'administrateur.</p>
      </div>
    </div>
  );
}
