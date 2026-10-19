import { useState, useEffect } from "react";
import NyxusChat from "./components/NyxusChat.jsx";
import Setting from "./components/setting.jsx";

export default function App() {
  const initialView =
    (typeof window !== "undefined" && window.__NYXUS_VIEW__) ||
    (typeof window !== "undefined" && window.location?.search?.includes("view=settings") ? "settings" : "chat");

  const [currentView, setCurrentView] = useState(initialView);

  useEffect(() => {
    function handleMessage(event) {
      const message = event.data;
      if (!message || typeof message.type !== "string") return;
      if (message.type === "set_view" && typeof message.view === "string") {
        setCurrentView(message.view);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (currentView === "settings") {
    return <Setting onBack={() => setCurrentView("chat")} />;
  }

  return <NyxusChat onOpenSettings={() => setCurrentView("settings")} />;
}


