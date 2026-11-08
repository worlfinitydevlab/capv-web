import React, { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Sales from "./pages/Sales.jsx";
import Students from "./pages/Students.jsx";
import Inscriptions from "./pages/Inscriptions.jsx";
import ExamensAdmission from "./pages/ExamensAdmission.jsx";
import DashboardPedagogie from "./pages/DashboardPedagogie.jsx";
import DisciplineDashboard from "./pages/DisciplineDashboard.jsx";
import DisciplineCarnets from "./pages/DisciplineCarnets.jsx";
import DisciplineSaisie from "./pages/DisciplineSaisie.jsx";
import DisciplineImprimables from "./pages/DisciplineImprimables.jsx";
import DisciplineConfig from "./pages/DisciplineConfig.jsx";
import DisciplineSuivi from "./pages/DisciplineSuivi.jsx";
import { useEspace } from "./espaceStore.js";
import { usePermissions } from "./PermissionsContext.jsx";
import { peutOuvrir } from "./permissionsCatalog.js";
import AccesRefuse from "./components/AccesRefuse.jsx";
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
import AccesSpeciaux from "./pages/AccesSpeciaux.jsx";
import { signalerPage } from "./accesSpecial/accesSpecialStore.js";

export default function App() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState("dashboard");
  const { espace } = useEspace();
  const permissions = usePermissions();
  const droitsSig = permissions ? permissions.droitsSig : "";
  // Acces special a droits temporaires : chaque page ouverte grace a ces droits entre dans le rapport (accesSpecial/accesSpecialStore.js)
  useEffect(() => { signalerPage(page, espace); }, [page, espace, droitsSig]);

  if (loading) return null;
  if (!user) return <Login />;

  // Une page ne s'affiche que si le role a le droit "voir" : cacher l'entree du menu ne suffit pas
  const pret = !!(permissions && permissions.loaded);
  const autorise = pret && peutOuvrir(permissions.can, page, espace);
  const pageAffichee = autorise ? page : null;

  return (
    <Layout current={page} onNavigate={setPage}>
      {pageAffichee === "dashboard" && (espace === "discipline" ? <DisciplineDashboard onNavigate={setPage} /> : espace === "pedagogie" ? <DashboardPedagogie /> : <Dashboard />)}
      {pageAffichee === "disc_carnets" && <DisciplineCarnets />}
      {pageAffichee === "disc_suivi" && <DisciplineSuivi />}
      {pageAffichee === "disc_saisie" && <DisciplineSaisie />}
      {pageAffichee === "disc_imprimables" && <DisciplineImprimables />}
      {pageAffichee === "disc_config" && <DisciplineConfig />}
      {pageAffichee === "inscriptions" && <Inscriptions />}
      {pageAffichee === "examens_admission" && <ExamensAdmission />}
      {pageAffichee === "annees_passees" && <AnneesPassees />}
      {pageAffichee === "matieres" && <Matieres />}
      {pageAffichee === "notes" && <Notes />}
      {pageAffichee === "saisie-notes" && <SaisieNotes />}
      {pageAffichee === "regles-academiques" && <RegleAcademiques />}
      {pageAffichee === "documents-imprimables" && <DocumentsImprimables />}
      {pageAffichee === "students" && <Students />}
      {pageAffichee === "assignments" && <Assignments />}
      {pageAffichee === "programs" && <Programs />}
      {pageAffichee === "misc_fees" && <MiscFees />}
      {pageAffichee === "settings" && <Settings />}
      {pageAffichee === "internal_requests" && <InternalRequests />}
      {pageAffichee === "bsa" && <BSA />}
      {pageAffichee === "employees" && <Employees />}
      {pageAffichee === "devices" && <Devices />}
      {pageAffichee === "cashier" && <Cashier />}
      {pageAffichee === "delivery" && <Delivery />}
      {pageAffichee === "comptes_bancaires" && <ComptesBancaires />}
      {pageAffichee === "sous_caisses" && <SousCaisses />}
      {pageAffichee === "plan_comptable" && <PlanComptable />}
      {pageAffichee === "ecritures" && <Ecritures />}
      {pageAffichee === "accounting" && <RevenusDepenses />}
      {pageAffichee === "cloture_caisse" && <ClotureCaisse />}
      {pageAffichee === "classes" && <Classes />}
      {pageAffichee === "years" && <Years />}
      {pageAffichee === "reductions" && <Reductions />}
      {pageAffichee === "journal" && <JournalVersements />}
      {pageAffichee === "expenses_grande" && <GrandeCaisse />}
      {pageAffichee === "expenses_petite" && <PetiteCaisse />}
      {pageAffichee === "users" && <Users />}
      {pageAffichee === "acces_speciaux" && <AccesSpeciaux />}
      {pageAffichee === "reports" && <Reports />}
      {pageAffichee === "store" && <Store />}
      {pageAffichee === "store_profitability" && <StoreProfitability />}
      {pageAffichee === "purchasing" && <Purchasing />}
      {pageAffichee === "fournisseurs" && <ComptesFournisseurs />}
      {pageAffichee === "clients" && <ComptesClients />}
      {pageAffichee === "etats_financiers" && <EtatsFinanciers />}
      {pageAffichee === "rapprochement" && <RapprochementBancaire />}
      {pageAffichee === "immobilisations" && <Immobilisations />}
      {pageAffichee === "sales" && <Sales />}
      {pret && !autorise && <AccesRefuse accueil={"dashboard" === page} />}
    </Layout>
  );
}