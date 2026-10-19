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
    userId: "",
  });

  const [customNameInput, setCustomNameInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConfiguringApiKey, setIsConfiguringApiKey] = useState(false);

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
            userId: message.userId || message.user_id || "",
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
            const updatedKey = message.apiKey !== undefined ? message.apiKey : apiKeyInput.trim();
            setWorkspaceInfo((prev) => ({
              ...prev,
              apiKey: updatedKey,
              hasApiKey: Boolean(updatedKey),
            }));
            setIsConfiguringApiKey(false);
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

        case "workspace_git_action_result":
          setLoading(false);
          if (message.ok && message.action === "unstage_workspace") {
            vscode.postMessage({ type: "get_workspace_info" });
          }
          setStatusMsg(message.ok
            ? { type: "success", text: message.action === "stage_workspace" ? "Workspace staged." : "Workspace unstaged." }
            : { type: "error", text: message.error || "Workspace staging failed." });
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
    if (workspaceInfo.workspaceId) return;
    setLoading(true);
    setStatusMsg({ type: "info", text: "Requesting Workspace ID from server..." });
    vscode.postMessage({ type: "request_workspace_id" });
  };

  const handleWorkspaceGitAction = (type) => {
    setLoading(true);
    setStatusMsg({ type: "info", text: type === "stage_workspace" ? "Staging workspace..." : "Unstaging workspace..." });
    vscode.postMessage({ type });
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
    if (!apiKeyInput.trim()) {
      setStatusMsg({ type: "error", text: "Please enter a valid API key." });
      return;
    }
    setStatusMsg({ type: "info", text: "Saving API key..." });
    vscode.postMessage({
      type: "save_api_key",
      apiKey: apiKeyInput.trim(),
    });
  };

  const handleClearApiKey = () => {
    if (window.confirm("Remove stored API key?")) {
      vscode.postMessage({
        type: "save_api_key",
        apiKey: "",
      });
      setApiKeyInput("");
      setWorkspaceInfo((prev) => ({ ...prev, apiKey: "", hasApiKey: false }));
      setIsConfiguringApiKey(false);
      setStatusMsg({ type: "info", text: "API key removed." });
    }
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
          <div className="vscode-settings-header-label">
            <svg
              className="vscode-settings-gear-icon"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="currentColor"
            >
              <path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.5.5v1.2l2.5.5.3.8-1.4 1.9.8.8 2-1.4.7.3.5 2.4h1.2l.5-2.4.8-.3 1.9 1.4.8-.8-1.4-2 .3-.7 2.4-.5V7.6l-2.4-.5-.3-.7 1.4-2-.8-.8-2 1.3-.7-.3zM8 10c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
            </svg>
            <span className="vscode-settings-title">Settings</span>
          </div>
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
          <svg
            className="vscode-settings-filter-icon"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="currentColor"
            title="Filter settings"
          >
            <path d="M6 12h4v1H6v-1zm-2-4h8v1H4V8zm-2-4h12v1H2V4z" />
          </svg>
        </div>
      </div>

      {/* Scope tabs and top action button */}
      <div className="vscode-settings-tabs-row">
        <div className="vscode-settings-tabs">
          <button
            type="button"
            className={`vscode-settings-tab ${activeTab === "user" ? "active" : ""}`}
            onClick={() => setActiveTab("user")}
          >
            User
          </button>
          <button
            type="button"
            className={`vscode-settings-tab ${activeTab === "workspace" ? "active" : ""}`}
            onClick={() => setActiveTab("workspace")}
          >
            Workspace
          </button>
        </div>

        {activeTab === "workspace" && !workspaceInfo.workspaceId && (
          <button
            type="button"
            className="vscode-settings-primary-btn"
            disabled={loading || Boolean(workspaceInfo.workspaceId)}
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
        )}

        {activeTab === "user" && (
          isConfiguringApiKey ? (
            <button
              type="button"
              className="vscode-settings-primary-btn"
              onClick={handleSaveApiKey}
              title="Save Nyxus API Key"
            >
              Save API Key
            </button>
          ) : (
            <button
              type="button"
              className="vscode-settings-primary-btn"
              onClick={() => {
                setApiKeyInput(workspaceInfo.apiKey || "");
                setIsConfiguringApiKey(true);
              }}
              title="Configure Nyxus API Key"
            >
              Configure API Key
            </button>
          )
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
            <span className="vscode-settings-nav-arrow">›</span>
            <span className="vscode-settings-nav-label">Workspace</span>
          </div>
          <div
            className={`vscode-settings-nav-item ${activeTab === "user" ? "selected" : ""}`}
            onClick={() => setActiveTab("user")}
          >
            <span className="vscode-settings-nav-arrow">›</span>
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
                    {!workspaceInfo.workspaceId && <button
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
                      ) : (
                        "Request Workspace ID"
                      )}
                    </button>}

                  </div>
                  <div className="vscode-setting-actions">
                    <button type="button" className="vscode-setting-action-btn" disabled={loading} onClick={() => handleWorkspaceGitAction("stage_workspace")}>Stage Workspace</button>
                    <button type="button" className="vscode-setting-action-btn" disabled={loading} onClick={() => handleWorkspaceGitAction("unstage_workspace")}>Unstage Workspace</button>
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
              {matchesSearch("API Key authentication token user") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › User: <span className="highlight">API Key</span>
                  </div>
                  <div className="vscode-setting-description">
                    API key used to authenticate and identify this Nyxus client with the server.
                  </div>

                  {!isConfiguringApiKey ? (
                    <div className="vscode-setting-key-view">
                      <div className="vscode-setting-control-row">
                        <input
                          type="text"
                          readOnly
                          className="vscode-setting-text-box vscode-setting-key-preview"
                          placeholder="No API key configured"
                          value={
                            workspaceInfo.apiKey
                              ? showApiKey
                                ? workspaceInfo.apiKey
                                : "••••••••••••••••••••••••••••••••"
                              : workspaceInfo.hasApiKey
                              ? "••••••••••••••••"
                              : ""
                          }
                        />
                        {workspaceInfo.apiKey ? (
                          <>
                            <button
                              type="button"
                              className="vscode-setting-action-btn"
                              onClick={() => setShowApiKey(!showApiKey)}
                              title={showApiKey ? "Hide API key" : "Show API key"}
                            >
                              {showApiKey ? "Hide" : "Show"}
                            </button>
                            <button
                              type="button"
                              className="vscode-setting-action-btn"
                              onClick={() => copyToClipboard(workspaceInfo.apiKey)}
                              title="Copy API key"
                            >
                              Copy
                            </button>
                          </>
                        ) : null}
                      </div>

                      <div className="vscode-setting-actions">
                        <button
                          type="button"
                          className="vscode-settings-primary-btn"
                          onClick={() => {
                            setApiKeyInput(workspaceInfo.apiKey || "");
                            setIsConfiguringApiKey(true);
                          }}
                        >
                          {workspaceInfo.apiKey || workspaceInfo.hasApiKey
                            ? "Configure API Key"
                            : "Set API Key"}
                        </button>
                        {(workspaceInfo.apiKey || workspaceInfo.hasApiKey) && (
                          <button
                            type="button"
                            className="vscode-setting-danger-btn"
                            onClick={handleClearApiKey}
                            title="Remove stored API key"
                          >
                            Remove Key
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveApiKey} className="vscode-setting-key-edit">
                      <div className="vscode-setting-control-row">
                        <input
                          type={showApiKey ? "text" : "password"}
                          className="vscode-setting-text-box"
                          placeholder="Enter Nyxus API Key"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          autoFocus
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
                          type="submit"
                          className="vscode-settings-primary-btn"
                        >
                          Save API Key
                        </button>
                        <button
                          type="button"
                          className="vscode-setting-action-btn"
                          onClick={() => {
                            setApiKeyInput(workspaceInfo.apiKey || "");
                            setIsConfiguringApiKey(false);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* User ID Setting */}
              {matchesSearch("User ID static identifier authentication") && (
                <div className="vscode-setting-item">
                  <div className="vscode-setting-title">
                    Nyxus › User: <span className="highlight">User ID</span>
                  </div>
                  <div className="vscode-setting-description">
                    Static identifier used to authenticate requests with the Nyxus server. This value
                    is managed by the extension and cannot be changed.
                  </div>

                  <div className="vscode-setting-control-row">
                    <input
                      type="text"
                      readOnly
                      className="vscode-setting-text-box vscode-setting-key-preview"
                      value={workspaceInfo.userId || "123"}
                      placeholder="Loading..."
                    />
                    <button
                      type="button"
                      className="vscode-setting-action-btn"
                      onClick={() => copyToClipboard(workspaceInfo.userId || "123")}
                      title="Copy User ID"
                    >
                      Copy
                    </button>
                  </div>

                  <div className="vscode-setting-description" style={{ marginTop: 4, fontStyle: "italic" }}>
                    Read-only — managed by the extension.
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
