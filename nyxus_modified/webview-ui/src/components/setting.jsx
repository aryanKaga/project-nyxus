import { useState, useEffect, useMemo } from "react";
import { getVsCodeApi } from "./chat/vscodeApi";
import { RefreshIcon } from "./NyxusIcons";
import "./NyxusSettings.css";

const vscode = getVsCodeApi();

export default function Setting({ onBack }) {
  const [workspaceInfo, setWorkspaceInfo] = useState({
    workspaceId: "",
    folderName: "",
    folderPath: "",
    serverUrl: "",
    userId: "",
  });
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: "", text: "" });
  const [activeTab, setActiveTab] = useState("workspace"); // 'user' | 'workspace'
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("workspace");

  useEffect(() => {
    function handleMessage(event) {
      const message = event.data;
      if (!message || typeof message.type !== "string") return;

      switch (message.type) {
        case "workspace_info":
          setWorkspaceInfo({
            workspaceId: message.workspaceId || "",
            folderName: message.folderName || "",
            folderPath: message.folderPath || "",
            serverUrl: message.serverUrl || "",
            userId: message.userId || "",
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

  const matchesSearch = (text) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  return (
    <div className="vscode-settings-root">
      {/* Top Header bar with Back button and Settings title */}
      <div className="vscode-settings-topbar">
        <div className="vscode-settings-title-group">
          {onBack && (
            <button
              type="button"
              className="vscode-settings-back-btn"
              onClick={onBack}
              title="Return to Chat"
            >
              ← Chat
            </button>
          )}
          <span className="vscode-settings-title">Settings</span>
        </div>
      </div>

      {/* Search settings input box */}
      <div className="vscode-settings-search-wrapper">
        <div className="vscode-settings-search-box">
          <svg
            className="vscode-settings-search-icon"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="vscode-settings-search-input"
            placeholder="Search settings"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="vscode-settings-search-clear"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* User / Workspace scope tabs and Sync button */}
      <div className="vscode-settings-tabs-row">
        <div className="vscode-settings-tabs">
          <button
            type="button"
            className={`vscode-settings-tab ${activeTab === "user" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("user");
              setSelectedCategory("user");
            }}
          >
            User
          </button>
          <button
            type="button"
            className={`vscode-settings-tab ${activeTab === "workspace" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("workspace");
              setSelectedCategory("workspace");
            }}
          >
            Workspace
          </button>
        </div>

        <button
          type="button"
          className="vscode-settings-primary-btn"
          disabled={loading}
          onClick={handleRequestWorkspaceId}
          title="Request a Workspace ID for this project folder"
        >
          {loading ? (
            <>
              <RefreshIcon className="nyxus-spin" size={13} />
              <span>Requesting...</span>
            </>
          ) : (
            "Request Workspace ID"
          )}
        </button>
      </div>

      {/* Status banner */}
      {statusMsg.text && (
        <div className={`vscode-settings-banner ${statusMsg.type}`}>
          <span>{statusMsg.text}</span>
          <button
            type="button"
            className="vscode-settings-banner-close"
            onClick={() => setStatusMsg({ type: "", text: "" })}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Settings layout */}
      <div className="vscode-settings-main-layout">
        {/* Left category list (collapses on narrow screens) */}
        <aside className="vscode-settings-sidebar">
          <div
            className={`vscode-settings-nav-item ${selectedCategory === "workspace" ? "selected" : ""}`}
            onClick={() => {
              setSelectedCategory("workspace");
              setActiveTab("workspace");
            }}
          >
            <span className="vscode-settings-nav-label">Workspace</span>
          </div>
          <div
            className={`vscode-settings-nav-item ${selectedCategory === "user" ? "selected" : ""}`}
            onClick={() => {
              setSelectedCategory("user");
              setActiveTab("user");
            }}
          >
            <span className="vscode-settings-nav-label">User & Connection</span>
          </div>
        </aside>

        {/* Right Settings body */}
        <section className="vscode-settings-content">
          <h2 className="vscode-settings-section-header">
            {activeTab === "workspace" ? "Workspace Settings" : "User Settings"}
          </h2>

          {activeTab === "workspace" && (
            <>
              {matchesSearch("Nyxus: Workspace ID assign request") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › Workspace: <span className="highlight">Workspace ID</span>
                  </div>
                  <div className="vscode-setting-description">
                    Server-assigned ID for this workspace folder. Connects your local codebase archive with Nyxus server storage and persistent project context.
                  </div>

                  <div className="vscode-setting-control-row">
                    <input
                      type="text"
                      readOnly
                      className="vscode-setting-text-box"
                      placeholder="No workspace ID assigned"
                      value={workspaceInfo.workspaceId}
                    />
                    {workspaceInfo.workspaceId && (
                      <button
                        type="button"
                        className="vscode-setting-action-btn"
                        onClick={() => copyToClipboard(workspaceInfo.workspaceId)}
                        title="Copy Workspace ID"
                      >
                        Copy
                      </button>
                    )}
                  </div>

                  <div className="vscode-setting-actions">
                    <button
                      type="button"
                      className="vscode-settings-primary-btn"
                      disabled={loading}
                      onClick={handleRequestWorkspaceId}
                    >
                      {loading ? (
                        <>
                          <RefreshIcon className="nyxus-spin" size={13} />
                          <span>Requesting Workspace ID...</span>
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
                        className="vscode-setting-danger-btn"
                        onClick={handleClearWorkspaceId}
                        disabled={loading}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {workspaceInfo.folderName && matchesSearch("Nyxus: Active Folder") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › Workspace: <span className="highlight">Active Folder</span>
                  </div>
                  <div className="vscode-setting-description">
                    Currently open project folder in VS Code workspace.
                  </div>
                  <div className="vscode-setting-control-row">
                    <span className="vscode-setting-badge">
                      {workspaceInfo.folderName}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "user" && (
            <>
              {matchesSearch("Nyxus: User ID") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › User: <span className="highlight">User ID</span>
                  </div>
                  <div className="vscode-setting-description">
                    Unique identifier for the authenticated Nyxus user.
                  </div>
                  <div className="vscode-setting-control-row">
                    <input
                      type="text"
                      readOnly
                      className="vscode-setting-text-box"
                      value={workspaceInfo.userId || "Not set"}
                    />
                  </div>
                </div>
              )}

              {matchesSearch("Nyxus: Server URL") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › Connection: <span className="highlight">Server URL</span>
                  </div>
                  <div className="vscode-setting-description">
                    Configured endpoint of the Nyxus backend service.
                  </div>
                  <div className="vscode-setting-control-row">
                    <input
                      type="text"
                      readOnly
                      className="vscode-setting-text-box"
                      value={workspaceInfo.serverUrl || "http://localhost:80"}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
