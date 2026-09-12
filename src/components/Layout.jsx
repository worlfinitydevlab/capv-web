import React from "react";
import { useAuth } from "../AuthContext.jsx";
import { useYear } from "../YearContext.jsx";
import { useSettings } from "../SettingsContext.jsx";

function YearSelector() {
  const { years, currentYear, setCurrentYear } = useYear();
  if (!years.length) return null;
  return (
    <div className="year-selector">
      <span className="year-selector-label">ANNEE DE TRAVAIL</span>
      <select value={currentYear ? currentYear.id : ""} onChange={(e) => {
        const y = years.find((y) => y.id === e.target.value);
        if (y) setCurrentYear(y);
      }}>
        {years.map((y) => <option key={y.id} value={y.id}>{y.nom} ({y.statut})</option>)}
      </select>
    </div>
  );
}

const MENU = [
  { id: "dashboard", label: "Tableau de bord" },
  { id: "students", label: "Eleves" },
  { id: "assignments", label: "Assignations" },
  { id: "programs", label: "Programmes & Activites" },
  { id: "classes", label: "Classes & Sections" },
  { id: "years", label: "Annees academiques" },
  { id: "reductions", label: "Bourses & Reductions" },
  { id: "journal", label: "Journal des versements" },
  { id: "expenses_grande", label: "Grande Caisse" },
  { id: "expenses_petite", label: "Petite Caisse" },
  { id: "misc_fees", label: "Frais Divers" },
  { id: "settings", label: "Parametres" },
  { id: "debts", label: "Creances" },
  { id: "users", label: "Utilisateurs" },
  { id: "reports", label: "Rapports" },
  { id: "store", label: "Magasin" },
  { id: "store_profitability", label: "Rentabilite Magasin" },
  { id: "purchasing", label: "Approvisionnement" },
  { id: "internal_requests", label: "Demandes internes" },
  { id: "bsa", label: "Bons de sortie" },
  { id: "employees", label: "Employes" },
  { id: "sales", label: "Ventes magasin" }
];

export default function Layout({ children, current, onNavigate }) {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const etab = (settings && settings.nom_etablissement) || "College Adventiste de Petion-Ville";
  const displayName = user ? (user.nom_complet || user.username) : "";
  const initials = displayName
    ? displayName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const title = (MENU.find((m) => m.id === current) || {}).label || "Tableau de bord";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          {settings && settings.logo
            ? <img src={settings.logo} className="sidebar-logo-img" alt="" />
            : <div className="sidebar-logo">CAPV</div>}
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-title">CAPV ERP</div>
            <div className="sidebar-brand-sub">{etab}</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-group">
            <div className="sidebar-group-title">Principal</div>
            {MENU.map((item) => (
              <button
                key={item.id}
                className={"sidebar-item" + (current === item.id ? " active" : "")}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div className="app-header-title">{title}</div>
          <div className="app-header-right">
            <YearSelector />
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "20px", background: "#dbeafe", fontSize: "12px", fontWeight: 700 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2563eb", display: "inline-block" }}></span>
              <span style={{ color: "#1e40af" }}>Consultation seule</span>
            </div>
            <div className="app-header-user">
              <div className="user-info">
                <div className="user-name">{displayName}</div>
                <div className="user-role">{user ? user.role : ""}</div>
              </div>
              <div className="user-avatar">{initials}</div>
              <button className="logout-btn" onClick={logout}>Deconnexion</button>
            </div>
          </div>
        </header>
        <main className="app-content">
          {children}
          <div className="dev-tag">Propulse par <strong>Worlfinity DevLab</strong></div>
        </main>
      </div>
    </div>
  );
}