


import { useState, useEffect, useRef, useCallback } from "react";
import {NyxusIcon, SendIcon, TypingDots} from "./NyxusIcons";
import "./NyxusChat.css";
/**
 * Safely get the VS Code API.
 * Works in both:
 * - VS Code webview
 * - Browser (npm run dev)
 */
function acquireVsCodeApiSafe() {
  if (
    typeof window !== "undefined" &&
    typeof window.acquireVsCodeApi === "function"
  ) {
    return window.acquireVsCodeApi();
  }

  // Browser fallback
  return {
    postMessage(message) {
      console.log("Mock postMessage:", message);
    },
  };
}

const vscode = acquireVsCodeApiSafe();


export default function NyxusChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");

  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  /**
   * Receive messages from the VS Code extension.
   */
  useEffect(() => {
    function handleMessage(event) {
      const msg = event.data;

      if (msg.type === "assistant_start") {
        setIsStreaming(true);
        setStreamingText("");
      }

      if (msg.type === "assistant_chunk") {
        setStreamingText((prev) => prev + msg.text);
      }

      if (msg.type === "assistant_end") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: streamingText,
          },
        ]);

        setStreamingText("");
        setIsStreaming(false);
      }

      // Simple non-streaming response support
      if (msg.type === "response") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: msg.text,
          },
        ]);
      }
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [streamingText]);

  function handleInputChange(e) {
    setInput(e.target.value);

    const ta = e.target;
    ta.style.height = "42px";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Add user message locally
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text,
      },
    ]);

    // Send to extension
    vscode.postMessage({
      type: "chat",
      prompt: text,
    });

    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "42px";
    }
  }

  const showWelcome = messages.length === 0 && !isStreaming;

  return (
    <>
      <div className="nyxus-root">
        <div className="nyxus-header">
          <NyxusIcon size={24} />
          <span className="nyxus-header-title">Nyxus</span>
          <span className="nyxus-status-dot" />
        </div>

        <div className="nyxus-messages">
          {showWelcome && (
            <div className="nyxus-welcome">
              <div style={{ color: "var(--nyxus-accent)" }}>
                <NyxusIcon size={56} />
              </div>
              <div className="nyxus-welcome-text">
                Hello! I am Nyxus.
                <br />
                How can I help you today?
              </div>
              <div className="nyxus-welcome-sub">// ready to assist</div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className={`nyxus-msg ${msg.role}`}>
              <div className="nyxus-msg-avatar">
                {msg.role === "assistant" ? <NyxusIcon size={14} /> : "U"}
              </div>
              <div className="nyxus-msg-bubble">{msg.text}</div>
            </div>
          ))}

          {isStreaming && (
            <div className="nyxus-msg assistant">
              <div className="nyxus-msg-avatar">
                <NyxusIcon size={14} />
              </div>
              <div className="nyxus-streaming-bubble">
                {streamingText ? (
                  <>
                    {streamingText}
                    <span className="nyxus-cursor" />
                  </>
                ) : (
                  <TypingDots />
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="nyxus-input-area">
          <div className="nyxus-input-wrapper">
            <textarea
              ref={textareaRef}
              className="nyxus-textarea"
              placeholder="Ask Nyxus anything..."
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
            />

            <button
              className="nyxus-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
