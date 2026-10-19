import { useState, useEffect } from "react";
import { getVsCodeApi } from "./chat/vscodeApi";
import { RefreshIcon } from "./NyxusIcons";
import "./NyxusSettings.css";

const vscode = getVsCodeApi();

export default function Setting({ onBack }) {
  const [workspaceInfo, setWorkspaceInfo] = useState({
    workspaceId: "",
    folderName: "",
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    function handleMessage(event) {
      const message = event.data;
      if (!message || typeof message.type !== "string") return;

      switch (message.type) {
        case "workspace_info":
          setWorkspaceInfo({
            workspaceId: message.workspaceId || "",
            folderName: message.folderName || "",
          });
          break;
        case "assign_workspace_id_result":
          setLoading(false);
          if (message.ok) {
            setStatusMsg({
              type: "success",
              text: `Workspace ID assigned: ${message.workspaceId}`,
            });
            setWorkspaceInfo((prev) => ({
              ...prev,
              workspaceId: message.workspaceId,
            }));
          } else {
            setStatusMsg({
              type: "error",
              text: message.error || "Failed to assign Workspace ID.",
            });
          }
          break;
        case "clear_workspace_id_result":
          setWorkspaceInfo((prev) => ({ ...prev, workspaceId: "" }));
          setStatusMsg({ type: "info", text: "Workspace ID cleared for this folder." });
          break;
        default:
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    vscode.postMessage({ type: "get_workspace_info" });

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const handleRequestWorkspaceId = () => {
    setLoading(true);
    setStatusMsg({ type: "info", text: "Requesting Workspace ID from server..." });
    vscode.postMessage({ type: "request_workspace_id" });
  };

  const handleClearWorkspaceId = () => {
    if (window.confirm("Remove stored Workspace ID for this folder?")) {
      vscode.postMessage({ type: "clear_workspace_id" });
    }
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setStatusMsg({ type: "success", text: "Copied to clipboard!" });
  };

  return (
    <div className="nyxus-settings-container">
      <div className="nyxus-settings-header">
        <div className="nyxus-header-top-row">
          {onBack && (
            <button
              type="button"
              className="nyxus-back-btn"
              onClick={onBack}
              title="Back to Chat"
            >
              ← Back to Chat
            </button>
          )}
          <h2 className="nyxus-settings-title">Nyxus Settings</h2>
        </div>
      </div>

      {statusMsg.text && (
        <div className={`nyxus-settings-banner ${statusMsg.type}`}>
          <span>{statusMsg.text}</span>
          <button
            type="button"
            className="nyxus-banner-close"
            onClick={() => setStatusMsg({ type: "", text: "" })}
          >
            ✕
          </button>
        </div>
      )}

      <div className="nyxus-settings-card">
        <div className="nyxus-card-header">
          <span className="nyxus-card-title">Workspace ID</span>
          {workspaceInfo.folderName && (
            <span className="nyxus-folder-badge" title={workspaceInfo.folderName}>
              {workspaceInfo.folderName}
            </span>
          )}
        </div>

        <div className="nyxus-card-body">
          <p className="nyxus-description">
            Assign a unique Workspace ID for this project to link local code archives with Nyxus server storage.
          </p>

          <div className="nyxus-input-group">
            <input
              type="text"
              readOnly
              className="nyxus-text-input"
              placeholder="No workspace ID assigned"
              value={workspaceInfo.workspaceId}
            />
            {workspaceInfo.workspaceId && (
              <button
                type="button"
                className="nyxus-btn nyxus-btn-ghost"
                onClick={() => copyToClipboard(workspaceInfo.workspaceId)}
                title="Copy Workspace ID"
              >
                Copy
              </button>
            )}
          </div>

          <div className="nyxus-actions-row">
            <button
              type="button"
              className="nyxus-btn nyxus-btn-primary"
              disabled={loading}
              onClick={handleRequestWorkspaceId}
            >
              {loading ? (
                <>
                  <RefreshIcon className="nyxus-spin" size={14} />
                  <span>Requesting ID...</span>
                </>
              ) : workspaceInfo.workspaceId ? (
                "Reassign / Refresh ID"
              ) : (
                "Request Workspace ID"
              )}
            </button>

            {workspaceInfo.workspaceId && (
              <button
                type="button"
                className="nyxus-btn nyxus-btn-danger"
                onClick={handleClearWorkspaceId}
                disabled={loading}
                title="Clear stored Workspace ID"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
