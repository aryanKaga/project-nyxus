import { NyxusIcon, SettingsIcon } from "../NyxusIcons";
import { getVsCodeApi } from "./vscodeApi";

const vscode = getVsCodeApi();

export default function ChatHeader({ connectionStatus }) {
  const handleOpenSettings = () => {
    vscode.postMessage({ type: "open_settings" });
  };

  return (
    <header className="nyxus-header">
      <NyxusIcon size={24} />
      <span className="nyxus-header-title">Nyxus</span>
      <span className={`nyxus-status-dot ${connectionStatus}`} />
      <span className="nyxus-status-label">{connectionStatus}</span>
      <button
        type="button"
        className="nyxus-header-btn"
        onClick={handleOpenSettings}
        title="Open Nyxus Settings"
        aria-label="Open Nyxus Settings"
      >
        <SettingsIcon size={16} />
      </button>
    </header>
  );
}
