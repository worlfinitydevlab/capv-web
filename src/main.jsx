import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { AuthProvider } from "./AuthContext.jsx";
import { YearProvider } from "./YearContext.jsx";
import { SettingsProvider } from "./SettingsContext.jsx";
import { DeviceProvider } from "./DeviceContext.jsx";
import { PermissionsProvider } from "./PermissionsContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <PermissionsProvider>
        <SettingsProvider>
          <DeviceProvider>
            <YearProvider>
              <App />
            </YearProvider>
          </DeviceProvider>
        </SettingsProvider>
      </PermissionsProvider>
    </AuthProvider>
  </React.StrictMode>
);