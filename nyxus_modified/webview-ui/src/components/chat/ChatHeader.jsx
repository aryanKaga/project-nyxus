import { NyxusIcon, SettingsIcon } from "../NyxusIcons";
import { getVsCodeApi } from "./vscodeApi";

const vscode = getVsCodeApi();

export default function ChatHeader({ connectionStatus, onOpenSettings }) {
  const handleOpenSettings = () => {
    if (typeof onOpenSettings === "function") {
      onOpenSettings();
    }
    vscode.postMessage({ type: "open_settings" });
  };

  const isConnected = connectionStatus === "connected";

  return (
    <header className="nyxus-header">
      <div className="nyxus-header-brand">
        <div className="nyxus-header-logo-box">
          <NyxusIcon size={18} />
        </div>
        <div className="nyxus-header-title-group">
          <div className="nyxus-header-title-row">
            <span className="nyxus-header-title">NYXUS</span>
            <span className="nyxus-header-badge">v2.0</span>
          </div>
          <span className="nyxus-header-sub">Cloud-Native Agent</span>
        </div>
      </div>

      <div className="nyxus-header-actions">
        <div className={`nyxus-header-status-pill ${isConnected ? "is-connected" : "is-disconnected"}`}>
          <span className="nyxus-status-pulse-dot" />
          <span className="nyxus-status-pill-text">
            {isConnected ? "K8S GATEWAY ACTIVE" : "OFFLINE"}
          </span>
        </div>

        <button
          type="button"
          className="nyxus-header-btn"
          onClick={handleOpenSettings}
          title="Open Nyxus Settings"
          aria-label="Open Nyxus Settings"
        >
          <SettingsIcon size={15} />
        </button>
      </div>
    </header>
  );
}
