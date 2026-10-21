import { NyxusIcon, TypingDots } from "../NyxusIcons";
import EnvelopeAnswer from "./EnvelopeAnswer";
import MarkdownMessage from "./MarkdownMessage";

function WelcomeMessage() {
  return (
    <div className="nyxus-welcome">
      <div className="nyxus-welcome-icon">
        <NyxusIcon size={56} />
      </div>
      <div className="nyxus-welcome-text">
        Hello! I am Nyxus.
        <br />
        How can I help you today?
      </div>
      <div className="nyxus-welcome-sub">// ready to assist</div>
    </div>
  );
}

function ChatMessage({ message, onOpenAnswer, isLatest }) {
  const isAssistant = message.role === "assistant";
  const isReadme = isAssistant && message.format === "readme";
  return (
    <article className={`nyxus-msg ${message.role}`}>
      <div className="nyxus-msg-avatar">
        {isAssistant ? <NyxusIcon size={14} /> : "U"}
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
  messages,
  messagesEndRef,
  onOpenAnswer,
  streamingText,
}) {
  const showWelcome = messages.length === 0 && !isStreaming;
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
      {isStreaming && <StreamingMessage text={streamingText} isReadme={isReadmeStreaming} />}
      <div ref={messagesEndRef} />
    </section>
  );
}
