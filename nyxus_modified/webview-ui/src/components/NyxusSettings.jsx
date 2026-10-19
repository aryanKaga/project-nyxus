import { useState, useEffect } from "react";
import { getVsCodeApi } from "./chat/vscodeApi";
import { RefreshIcon } from "./NyxusIcons";
import "./NyxusSettings.css";

const vscode = getVsCodeApi();

export default function NyxusSettings() {
  const [workspaceInfo, setWorkspaceInfo] = useState({
    workspaceId: "",
    folderPath: "",
    folderName: "",
    serverUrl: "",
    userId: "",
    isSyncing: false,
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
            folderPath: message.folderPath || "",
            folderName: message.folderName || "",
            serverUrl: message.serverUrl || "",
            userId: message.userId || "",
            isSyncing: message.isSyncing || false,
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
    setStatusMsg({ type: "info", text: "Requesting Workspace ID from Nyxus server..." });
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
        <h2 className="nyxus-settings-title">Workspace Settings</h2>
        <p className="nyxus-settings-sub">
          Manage Workspace ID assignment and persistence for this repository folder.
        </p>
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
          <span className="nyxus-card-title">Active Folder</span>
          <span className="nyxus-folder-badge">
            {workspaceInfo.folderName || "No folder open"}
          </span>
        </div>
        <div className="nyxus-card-body">
          <label className="nyxus-field-label">Path:</label>
          <div className="nyxus-code-box" title={workspaceInfo.folderPath}>
            {workspaceInfo.folderPath || "None"}
          </div>
        </div>
      </div>

      <div className="nyxus-settings-card">
        <div className="nyxus-card-header">
          <span className="nyxus-card-title">Workspace ID</span>
          {workspaceInfo.workspaceId ? (
            <span className="nyxus-badge-active">Stored in VS Code</span>
          ) : (
            <span className="nyxus-badge-missing">Not Assigned</span>
          )}
        </div>
        <div className="nyxus-card-body">
          <p className="nyxus-description">
            The Workspace ID links your local codebase archive with Nyxus server storage & conversation memory.
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
                title="Copy ID"
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
                  <span>Assigning...</span>
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
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="nyxus-settings-card">
        <div className="nyxus-card-header">
          <span className="nyxus-card-title">Connection Info</span>
        </div>
        <div className="nyxus-card-body">
          <div className="nyxus-meta-row">
            <span className="nyxus-meta-label">Server URL:</span>
            <span className="nyxus-meta-val">{workspaceInfo.serverUrl || "Not set"}</span>
          </div>
          <div className="nyxus-meta-row">
            <span className="nyxus-meta-label">User ID:</span>
            <span className="nyxus-meta-val nyxus-truncate" title={workspaceInfo.userId}>
              {workspaceInfo.userId || "Not set"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
