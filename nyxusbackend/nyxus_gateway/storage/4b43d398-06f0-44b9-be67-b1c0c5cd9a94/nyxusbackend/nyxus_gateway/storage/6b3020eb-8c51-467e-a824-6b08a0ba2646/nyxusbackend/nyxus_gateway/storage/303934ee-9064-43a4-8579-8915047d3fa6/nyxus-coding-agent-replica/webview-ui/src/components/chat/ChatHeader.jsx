import { NyxusIcon } from "../NyxusIcons";

export default function ChatHeader({ connectionStatus }) {
  return (
    <header className="nyxus-header">
      <NyxusIcon size={24} />
      <span className="nyxus-header-title">Nyxus</span>
      <span className={`nyxus-status-dot ${connectionStatus}`} />
      <span className="nyxus-status-label">{connectionStatus}</span>
    </header>
  );
}
