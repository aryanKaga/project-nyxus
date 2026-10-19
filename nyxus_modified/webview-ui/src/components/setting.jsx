import { useState, useEffect } from "react";
import { getVsCodeApi } from "./chat/vscodeApi";
import { RefreshIcon } from "./NyxusIcons";
import "./NyxusSettings.css";

const vscode = getVsCodeApi();

export default function Setting({ onBack }) {
  const [workspaceInfo, setWorkspaceInfo] = useState({
    workspaceId: "",
    folderName: "",
    folderPath: "",
    customName: "",
    description: "",
    apiKey: "",
    hasApiKey: false,
  });

  const [customNameInput, setCustomNameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: "", text: "" });
  const [activeTab, setActiveTab] = useState("workspace"); // 'workspace' | 'user'
  const [searchQuery, setSearchQuery] = useState("");

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
            customName: message.customName || "",
            description: message.description || "",
            apiKey: message.apiKey || "",
            hasApiKey: Boolean(message.hasApiKey),
          });
          setCustomNameInput(message.customName || message.folderName || "");
          setDescriptionInput(message.description || "");
          setApiKeyInput(message.apiKey || "");
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

        case "save_workspace_metadata_result":
          if (message.ok) {
            setStatusMsg({
              type: "success",
              text: "Workspace custom name and description saved.",
            });
            setWorkspaceInfo((prev) => ({
              ...prev,
              customName: message.customName,
              description: message.description,
            }));
          } else {
            setStatusMsg({
              type: "error",
              text: message.error || "Failed to save workspace details.",
            });
          }
          break;

        case "save_api_key_result":
          if (message.ok) {
            setStatusMsg({
              type: "success",
              text: "API key saved successfully.",
            });
            setWorkspaceInfo((prev) => ({
              ...prev,
              apiKey: message.apiKey || prev.apiKey,
              hasApiKey: true,
            }));
          } else {
            setStatusMsg({
              type: "error",
              text: message.error || "Failed to save API key.",
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

  const handleSaveWorkspaceMetadata = (e) => {
    e?.preventDefault();
    vscode.postMessage({
      type: "save_workspace_metadata",
      customName: customNameInput,
      description: descriptionInput,
    });
  };

  const handleSaveApiKey = (e) => {
    e?.preventDefault();
    vscode.postMessage({
      type: "save_api_key",
      apiKey: apiKeyInput,
    });
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

      {/* Scope tabs and top action button */}
      <div className="vscode-settings-tabs-row">
        <div className="vscode-settings-tabs">
          <button
            type="button"
            className={`vscode-settings-tab ${activeTab === "workspace" ? "active" : ""}`}
            onClick={() => setActiveTab("workspace")}
          >
            Workspace
          </button>
          <button
            type="button"
            className={`vscode-settings-tab ${activeTab === "user" ? "active" : ""}`}
            onClick={() => setActiveTab("user")}
          >
            User
          </button>
        </div>

        {activeTab === "workspace" && (
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
            ) : workspaceInfo.workspaceId ? (
              "Reassign Workspace ID"
            ) : (
              "Request Workspace ID"
            )}
          </button>
        )}
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
        {/* Left category list */}
        <aside className="vscode-settings-sidebar">
          <div
            className={`vscode-settings-nav-item ${activeTab === "workspace" ? "selected" : ""}`}
            onClick={() => setActiveTab("workspace")}
          >
            <span className="vscode-settings-nav-label">Workspace</span>
          </div>
          <div
            className={`vscode-settings-nav-item ${activeTab === "user" ? "selected" : ""}`}
            onClick={() => setActiveTab("user")}
          >
            <span className="vscode-settings-nav-label">API Key & User</span>
          </div>
        </aside>

        {/* Right Settings body */}
        <section className="vscode-settings-content">
          <h2 className="vscode-settings-section-header">
            {activeTab === "workspace" ? "Workspace Settings" : "User Settings"}
          </h2>

          {activeTab === "workspace" && (
            <>
              {/* Workspace ID Setting */}
              {matchesSearch("Workspace ID static assign") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › Workspace: <span className="highlight">Workspace ID</span>
                  </div>
                  <div className="vscode-setting-description">
                    Server-assigned static ID for this workspace. Identifies and binds local project archives with server-side workspace memory.
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
                        "Reassign Workspace ID"
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
                        title="Clear stored Workspace ID"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Custom Workspace Name Setting */}
              {matchesSearch("Custom Name workspace name") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › Workspace: <span className="highlight">Custom Name</span>
                  </div>
                  <div className="vscode-setting-description">
                    Custom descriptive name for this workspace. Used to identify the workspace on the Nyxus server.
                  </div>

                  <div className="vscode-setting-control-row">
                    <input
                      type="text"
                      className="vscode-setting-text-box"
                      placeholder={workspaceInfo.folderName || "e.g. My Backend Service"}
                      value={customNameInput}
                      onChange={(e) => setCustomNameInput(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Workspace Description Setting */}
              {matchesSearch("Description workspace description") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › Workspace: <span className="highlight">Description</span>
                  </div>
                  <div className="vscode-setting-description">
                    Detailed summary or description of the project workspace.
                  </div>

                  <div className="vscode-setting-control-row">
                    <textarea
                      rows={3}
                      className="vscode-setting-text-box vscode-setting-textarea"
                      placeholder="e.g. Microservice handling authentication and user sessions."
                      value={descriptionInput}
                      onChange={(e) => setDescriptionInput(e.target.value)}
                    />
                  </div>

                  <div className="vscode-setting-actions">
                    <button
                      type="button"
                      className="vscode-settings-primary-btn"
                      onClick={handleSaveWorkspaceMetadata}
                    >
                      Save Workspace Details
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "user" && (
            <>
              {/* API Key Setting */}
              {matchesSearch("API Key authentication") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › User: <span className="highlight">API Key</span>
                  </div>
                  <div className="vscode-setting-description">
                    API key used to authenticate and identify this Nyxus client with the server.
                  </div>

                  <div className="vscode-setting-control-row">
                    <input
                      type={showApiKey ? "text" : "password"}
                      className="vscode-setting-text-box"
                      placeholder="Enter Nyxus API Key"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="vscode-setting-action-btn"
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? "Hide key" : "Show key"}
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>

                  <div className="vscode-setting-actions">
                    <button
                      type="button"
                      className="vscode-settings-primary-btn"
                      onClick={handleSaveApiKey}
                    >
                      Save API Key
                    </button>
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
