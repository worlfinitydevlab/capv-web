import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext.jsx";
import { getAuthedClient } from "./supabaseClient.js";

const DeviceContext = createContext(null);

function getOrCreateDeviceId() {
  let id = localStorage.getItem("capv_device_id");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : "dev-" + Date.now() + "-" + Math.random().toString(16).slice(2));
    localStorage.setItem("capv_device_id", id);
  }
  return id;
}

export function DeviceProvider({ children }) {
  const { token, user } = useAuth();
  const [deviceId] = useState(getOrCreateDeviceId);
  const [capabilities, setCapabilities] = useState([]);
  const [label, setLabel] = useState("");
  const [loaded, setLoaded] = useState(false);

  const registerAndLoad = async () => {
    if (!token) return;
    try {
      const supabase = getAuthedClient(token);
      const { data: existing } = await supabase.from("device_registrations").select("*").eq("device_id", deviceId).maybeSingle();
      if (existing) {
        await supabase.from("device_registrations").update({
          last_seen_at: new Date().toISOString(),
          last_username: user ? user.username : existing.last_username
        }).eq("device_id", deviceId);
        setCapabilities((existing.capabilities || "").split(",").filter(Boolean));
        setLabel(existing.label || "");
      } else {
        const defaultLabel = (navigator.platform || "Appareil") + " - " + (user ? user.username : "?");
        await supabase.from("device_registrations").insert({
          device_id: deviceId,
          label: defaultLabel,
          capabilities: "",
          last_username: user ? user.username : null
        });
        setCapabilities([]);
        setLabel(defaultLabel);
      }
    } catch (e) {}
    setLoaded(true);
  };

  useEffect(() => { registerAndLoad(); }, [token]);

  const hasCapability = (cap) => capabilities.includes(cap);

  return (
    <DeviceContext.Provider value={{ deviceId, capabilities, label, loaded, hasCapability, reloadDevice: registerAndLoad }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceContext);
}