import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { AuthProvider } from "./AuthContext.jsx";
import { YearProvider } from "./YearContext.jsx";
import { SettingsProvider } from "./SettingsContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <YearProvider>
          <App />
        </YearProvider>
      </SettingsProvider>
    </AuthProvider>
  </React.StrictMode>
);