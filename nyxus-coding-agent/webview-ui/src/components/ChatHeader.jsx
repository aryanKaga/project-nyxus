import { NyxusIcon } from "./NyxusIcons";

const statusLabels = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  error: "Connection error",
};

export default function ChatHeader({
  connectionStatus,
  connectionError,
  onReconnect,
}) {
  const canReconnect =
    connectionStatus === "disconnected" ||
    connectionStatus === "error";

  return (
    <header className="nyxus-header">
      <div className="nyxus-brand">
        <NyxusIcon size={28} />
        <div>
          <div className="nyxus-header-title">Nyxus</div>
          <div className="nyxus-header-subtitle">Coding assistant</div>
        </div>
      </div>
      <div
        className={`nyxus-connection ${connectionStatus}`}
        title={connectionError ?? undefined}
      >
        <span className="nyxus-status-dot" />
        <span>{statusLabels[connectionStatus] ?? statusLabels.connecting}</span>
        {canReconnect && (
          <button
            aria-label="Reconnect to Nyxus server"
            className="nyxus-reconnect"
            onClick={onReconnect}
            type="button"
          >
            Retry
          </button>
        )}
      </div>
    </header>
  );
}
