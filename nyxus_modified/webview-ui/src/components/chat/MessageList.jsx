import { NyxusIcon, TypingDots } from "../NyxusIcons";
import EnvelopeAnswer from "./EnvelopeAnswer";
import MarkdownMessage from "./MarkdownMessage";

function WelcomeMessage() {
  return (
    <div className="nyxus-welcome">
      <div className="nyxus-welcome-badge">
        <span className="nyxus-welcome-ping-dot" />
        <span className="nyxus-welcome-badge-text">NYXUS RUNTIME 2.0</span>
        <span className="nyxus-welcome-badge-sep">|</span>
        <span className="nyxus-welcome-badge-sub">Deep-Context Cloud Pair Programmer</span>
      </div>

      <div className="nyxus-welcome-hero-box">
        <div className="nyxus-welcome-icon-wrap">
          <NyxusIcon size={40} />
        </div>
        <h1 className="nyxus-welcome-title">
          Autonomous Coding Intelligence.
          <br />
          <span className="nyxus-welcome-title-accent">Connected to your Editor.</span>
        </h1>
        <p className="nyxus-welcome-desc">
          Isolates repository context into ephemeral Kubernetes agent pods, orchestrating multi-agent LangGraph workflows and streaming markdown solutions directly into VS Code.
        </p>
      </div>

      <div className="nyxus-welcome-stats-grid">
        <div className="nyxus-stat-card">
          <span className="nyxus-stat-value">&lt; 15s</span>
          <span className="nyxus-stat-label">POD COLD START</span>
        </div>
        <div className="nyxus-stat-card">
          <span className="nyxus-stat-value">0 ms</span>
          <span className="nyxus-stat-label">LOCAL CPU OVERHEAD</span>
        </div>
        <div className="nyxus-stat-card">
          <span className="nyxus-stat-value">100%</span>
          <span className="nyxus-stat-label">GIT DELTA SYNC</span>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message, onOpenAnswer, isLatest }) {
  const isAssistant = message.role === "assistant";
  const isReadme = isAssistant && message.format === "readme";
  return (
    <article className={`nyxus-msg ${message.role}`}>
      <div className="nyxus-msg-avatar">
        {isAssistant ? <NyxusIcon size={16} /> : <span className="nyxus-user-prompt">&gt;_</span>}
      </div>
      <div className={`nyxus-msg-bubble${isReadme ? " has-envelope" : ""}`}>
        {isReadme ? (
          <EnvelopeAnswer
            content={message.text}
            filename="answer.md"
            onOpenInEditor={onOpenAnswer}
            autoOpen={isLatest}
          />
        ) : isAssistant ? (
          <div className="nyxus-msg-content-wrapper">
            <MarkdownMessage content={message.text} />
            <button
              type="button"
              className="nyxus-view-answer-btn"
              title="View this response as answer.md in VS Code"
              onClick={() => onOpenAnswer && onOpenAnswer(message.text)}
            >
              View answer.md ↗
            </button>
          </div>
        ) : (
          message.text
        )}
      </div>
    </article>
  );
}

function PodStartupLoader() {
  return (
    <article className="nyxus-msg assistant">
      <div className="nyxus-msg-avatar"><NyxusIcon size={16} /></div>
      <div className="nyxus-pod-loader-bubble">
        <div className="nyxus-pod-loader-badge">
          <span className="nyxus-pod-dot-ping" />
          <span>K8S RUNTIME PROVISIONING</span>
        </div>
        <div className="nyxus-pod-loader-header">
          <div className="nyxus-spinner" />
          <span className="nyxus-pod-loader-title">Starting agent pod...</span>
        </div>
        <div className="nyxus-pod-loader-sub">
          Isolating repository context into ephemeral Kubernetes container (&lt; 15s)
        </div>
        <div className="nyxus-pod-progress-track">
          <div className="nyxus-pod-progress-bar" />
        </div>
      </div>
    </article>
  );
}

function StreamingMessage({ text, isReadme }) {
  return (
    <article className="nyxus-msg assistant">
      <div className="nyxus-msg-avatar"><NyxusIcon size={14} /></div>
      <div className={`nyxus-streaming-bubble${isReadme ? " is-readme" : ""}`}>
        {text
          ? isReadme
            ? (
              <div className="nyxus-streaming-readme">
                <MarkdownMessage content={text} />
                <span className="nyxus-cursor" />
              </div>
            )
            : <div className="nyxus-streaming-text">{text}<span className="nyxus-cursor" /></div>
          : <TypingDots />}
      </div>
    </article>
  );
}

export default function MessageList({
  isStreaming,
  isReadmeStreaming,
  isWaitingForServer,
  messages,
  messagesEndRef,
  onOpenAnswer,
  streamingText,
}) {
  const showWelcome = messages.length === 0 && !isStreaming && !isWaitingForServer;
  const lastIndex = messages.length - 1;

  return (
    <section className="nyxus-messages" aria-live="polite">
      {showWelcome && <WelcomeMessage />}
      {messages.map((message, index) => (
        <ChatMessage
          key={`${message.role}-${index}`}
          message={message}
          onOpenAnswer={onOpenAnswer}
          isLatest={index === lastIndex}
        />
      ))}
      {isWaitingForServer && !isStreaming && <PodStartupLoader />}
      {isStreaming && <StreamingMessage text={streamingText} isReadme={isReadmeStreaming} />}
      <div ref={messagesEndRef} />
    </section>
  );
}
