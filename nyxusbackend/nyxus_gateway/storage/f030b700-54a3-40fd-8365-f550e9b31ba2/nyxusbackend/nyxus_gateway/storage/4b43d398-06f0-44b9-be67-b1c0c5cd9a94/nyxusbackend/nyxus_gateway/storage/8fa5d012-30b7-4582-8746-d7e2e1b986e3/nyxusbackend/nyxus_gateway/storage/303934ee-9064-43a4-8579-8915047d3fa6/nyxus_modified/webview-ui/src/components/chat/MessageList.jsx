import { NyxusIcon, TypingDots } from "../NyxusIcons";
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

function ChatMessage({ message }) {
  const isAssistant = message.role === "assistant";
  return (
    <article className={`nyxus-msg ${message.role}`}>
      <div className="nyxus-msg-avatar">
        {isAssistant ? <NyxusIcon size={14} /> : "U"}
      </div>
      <div className="nyxus-msg-bubble">
        {isAssistant ? <MarkdownMessage content={message.text} /> : message.text}
      </div>
    </article>
  );
}

function StreamingMessage({ text }) {
  return (
    <article className="nyxus-msg assistant">
      <div className="nyxus-msg-avatar"><NyxusIcon size={14} /></div>
      <div className="nyxus-streaming-bubble">
        {text
          ? <div className="nyxus-streaming-text">{text}<span className="nyxus-cursor" /></div>
          : <TypingDots />}
      </div>
    </article>
  );
}

export default function MessageList({
  isStreaming,
  messages,
  messagesEndRef,
  streamingText,
}) {
  const showWelcome = messages.length === 0 && !isStreaming;

  return (
    <section className="nyxus-messages" aria-live="polite">
      {showWelcome && <WelcomeMessage />}
      {messages.map((message, index) => (
        <ChatMessage key={`${message.role}-${index}`} message={message} />
      ))}
      {isStreaming && <StreamingMessage text={streamingText} />}
      <div ref={messagesEndRef} />
    </section>
  );
}
