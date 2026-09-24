import React, { useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Sales from "./pages/Sales.jsx";
import Students from "./pages/Students.jsx";
import Classes from "./pages/Classes.jsx";
import Years from "./pages/Years.jsx";
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
import Debts from "./pages/Debts.jsx";
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
import ComptesFournisseurs from "./pages/ComptesFournisseurs.jsx";
import EtatsFinanciers from "./pages/EtatsFinanciers.jsx";
import ClotureCaisse from "./pages/ClotureCaisse.jsx";

export default function App() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState("dashboard");

  if (loading) return null;
  if (!user) return <Login />;

  return (
    <Layout current={page} onNavigate={setPage}>
      {page === "dashboard" && <Dashboard />}
      {page === "students" && <Students />}
      {page === "assignments" && <Assignments />}
      {page === "programs" && <Programs />}
      {page === "misc_fees" && <MiscFees />}
      {page === "settings" && <Settings />}
      {page === "debts" && <Debts />}
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
      {page === "etats_financiers" && <EtatsFinanciers />}
      {page === "sales" && <Sales />}
    </Layout>
  );
}