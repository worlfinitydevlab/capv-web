import React, { useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Sales from "./pages/Sales.jsx";
import Students from "./pages/Students.jsx";
import Inscriptions from "./pages/Inscriptions.jsx";
import DashboardPedagogie from "./pages/DashboardPedagogie.jsx";
import DisciplineDashboard from "./pages/DisciplineDashboard.jsx";
import DisciplineCarnets from "./pages/DisciplineCarnets.jsx";
import DisciplineSaisie from "./pages/DisciplineSaisie.jsx";
import DisciplineImprimables from "./pages/DisciplineImprimables.jsx";
import DisciplineConfig from "./pages/DisciplineConfig.jsx";
import { useEspace } from "./espaceStore.js";
import Classes from "./pages/Classes.jsx";
import Years from "./pages/Years.jsx";
import AnneesPassees from "./pages/AnneesPassees.jsx";
import Matieres from "./pages/Matieres.jsx";
import Notes from "./pages/Notes.jsx";
import SaisieNotes from "./pages/SaisieNotes.jsx";
import RegleAcademiques from "./pages/RegleAcademiques.jsx";
import DocumentsImprimables from "./pages/DocumentsImprimables.jsx";
import Reductions from "./pages/Reductions.jsx";
import JournalVersements from "./pages/JournalVersements.jsx";
import GrandeCaisse from "./pages/GrandeCaisse.jsx";
import PetiteCaisse from "./pages/PetiteCaisse.jsx";
import Users from "./pages/Users.jsx";
import Reports from "./pages/Reports.jsx";
import Store from "./pages/Store.jsx";
import StoreProfitability from "./pages/StoreProfitability.jsx";
import Purchasing from "./pages/Purchasing.jsx";
import Assignments from "./pages/Assignments.jsx";
import Programs from "./pages/Programs.jsx";
import MiscFees from "./pages/MiscFees.jsx";
import Settings from "./pages/Settings.jsx";
import InternalRequests from "./pages/InternalRequests.jsx";
import BSA from "./pages/BSA.jsx";
import Employees from "./pages/Employees.jsx";
import Devices from "./pages/Devices.jsx";
import Cashier from "./pages/Cashier.jsx";
import Delivery from "./pages/Delivery.jsx";
import ComptesBancaires from "./pages/ComptesBancaires.jsx";
import SousCaisses from "./pages/SousCaisses.jsx";
import PlanComptable from "./pages/PlanComptable.jsx";
import Ecritures from "./pages/Ecritures.jsx";
import RevenusDepenses from "./pages/RevenusDepenses.jsx";
import ComptesFournisseurs from "./pages/ComptesFournisseurs.jsx";
import ComptesClients from "./pages/ComptesClients.jsx";
import EtatsFinanciers from "./pages/EtatsFinanciers.jsx";
import RapprochementBancaire from "./pages/RapprochementBancaire.jsx";
import Immobilisations from "./pages/Immobilisations.jsx";
import ClotureCaisse from "./pages/ClotureCaisse.jsx";

export default function App() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState("dashboard");
  const { espace } = useEspace();

  if (loading) return null;
  if (!user) return <Login />;

  return (
    <Layout current={page} onNavigate={setPage}>
      {page === "dashboard" && (espace === "discipline" ? <DisciplineDashboard onNavigate={setPage} /> : espace === "pedagogie" ? <DashboardPedagogie /> : <Dashboard />)}
      {page === "disc_carnets" && <DisciplineCarnets />}
      {page === "disc_saisie" && <DisciplineSaisie />}
      {page === "disc_imprimables" && <DisciplineImprimables />}
      {page === "disc_config" && <DisciplineConfig />}
      {page === "inscriptions" && <Inscriptions />}
      {page === "annees_passees" && <AnneesPassees />}
      {page === "matieres" && <Matieres />}
      {page === "notes" && <Notes />}
      {page === "saisie-notes" && <SaisieNotes />}
      {page === "regles-academiques" && <RegleAcademiques />}
      {page === "documents-imprimables" && <DocumentsImprimables />}
      {page === "students" && <Students />}
      {page === "assignments" && <Assignments />}
      {page === "programs" && <Programs />}
      {page === "misc_fees" && <MiscFees />}
      {page === "settings" && <Settings />}
      {page === "internal_requests" && <InternalRequests />}
      {page === "bsa" && <BSA />}
      {page === "employees" && <Employees />}
      {page === "devices" && <Devices />}
      {page === "cashier" && <Cashier />}
      {page === "delivery" && <Delivery />}
      {page === "comptes_bancaires" && <ComptesBancaires />}
      {page === "sous_caisses" && <SousCaisses />}
      {page === "plan_comptable" && <PlanComptable />}
      {page === "ecritures" && <Ecritures />}
      {page === "accounting" && <RevenusDepenses />}
      {page === "cloture_caisse" && <ClotureCaisse />}
      {page === "classes" && <Classes />}
      {page === "years" && <Years />}
      {page === "reductions" && <Reductions />}
      {page === "journal" && <JournalVersements />}
      {page === "expenses_grande" && <GrandeCaisse />}
      {page === "expenses_petite" && <PetiteCaisse />}
      {page === "users" && <Users />}
      {page === "reports" && <Reports />}
      {page === "store" && <Store />}
      {page === "store_profitability" && <StoreProfitability />}
      {page === "purchasing" && <Purchasing />}
      {page === "fournisseurs" && <ComptesFournisseurs />}
      {page === "clients" && <ComptesClients />}
      {page === "etats_financiers" && <EtatsFinanciers />}
      {page === "rapprochement" && <RapprochementBancaire />}
      {page === "immobilisations" && <Immobilisations />}
      {page === "sales" && <Sales />}
    </Layout>
  );
}