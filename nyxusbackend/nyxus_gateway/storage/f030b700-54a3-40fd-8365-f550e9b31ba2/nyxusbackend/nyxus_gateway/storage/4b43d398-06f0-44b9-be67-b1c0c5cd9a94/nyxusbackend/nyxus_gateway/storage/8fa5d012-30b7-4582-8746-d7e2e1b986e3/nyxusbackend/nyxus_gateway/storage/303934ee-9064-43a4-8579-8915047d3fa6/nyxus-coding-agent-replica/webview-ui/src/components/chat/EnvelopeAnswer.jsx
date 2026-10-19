import { useState } from "react";
import { EnvelopeIcon, EnvelopeOpenIcon } from "../NyxusIcons";
import MarkdownMessage from "./MarkdownMessage";

export default function EnvelopeAnswer({
  content,
  filename = "answer.md",
  onOpenInEditor,
}) {
  const [isOpen, setIsOpen] = useState(false);

  function handleOpenEditor(event) {
    if (event) {
      event.stopPropagation();
    }
    if (typeof onOpenInEditor === "function") {
      onOpenInEditor(content);
    }
  }

  function handleToggle(event) {
    if (event) {
      event.stopPropagation();
    }
    setIsOpen(!isOpen);
  }

  return (
    <div className={`nyxus-envelope-container${isOpen ? " is-open" : " is-compressed"}`}>
      <div
        className="nyxus-envelope-card"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={handleOpenEditor}
        title={`Click to open ${filename} in VS Code editor`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpenEditor(e);
          }
        }}
      >
        <div className="nyxus-envelope-header">
          <div className="nyxus-envelope-title-group">
            <span className="nyxus-envelope-icon-wrap">
              {isOpen ? <EnvelopeOpenIcon size={20} /> : <EnvelopeIcon size={20} />}
            </span>
            <div className="nyxus-envelope-meta">
              <span className="nyxus-envelope-filename">{filename}</span>
              <span className="nyxus-envelope-badge">SAVED AS FILE</span>
            </div>
          </div>
          <div className="nyxus-envelope-actions">
            <button
              type="button"
              className="nyxus-envelope-action-btn primary"
              title={`Open ${filename} in VS Code editor`}
              onClick={handleOpenEditor}
            >
              Open {filename} ↗
            </button>
            <button
              type="button"
              className="nyxus-envelope-toggle-btn"
              title={isOpen ? "Collapse inline preview" : "Peek preview in chatbox"}
              onClick={handleToggle}
            >
              {isOpen ? "Hide preview ▴" : "Peek preview ▾"}
            </button>
          </div>
        </div>

        {!isOpen && (
          <div className="nyxus-envelope-flap-preview">
            <div className="nyxus-envelope-seal">
              <span className="nyxus-envelope-seal-icon">📄</span>
              <span className="nyxus-envelope-seal-text">{filename} is ready in your workspace</span>
            </div>
            <p className="nyxus-envelope-hint-text">
              Formatted as a standalone Markdown file. Click anywhere on this card to open in VS Code editor.
            </p>
          </div>
        )}
      </div>

      {isOpen && (
        <div className="nyxus-envelope-letter">
          <div className="nyxus-envelope-letter-header">
            <span className="nyxus-envelope-letter-tag">// {filename} inline preview</span>
            <button
              type="button"
              className="nyxus-envelope-action-btn primary"
              title={`Open ${filename} in VS Code editor`}
              onClick={handleOpenEditor}
            >
              Open in Editor ↗
            </button>
          </div>
          <MarkdownMessage content={content} />
        </div>
      )}
    </div>
  );
}
