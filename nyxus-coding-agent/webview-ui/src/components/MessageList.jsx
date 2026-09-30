import { NyxusIcon, TypingDots } from "./NyxusIcons";
import MarkdownMessage from "./MarkdownMessage";
import WelcomeScreen from "./WelcomeScreen";

function Message({ message }) {
  const isAssistant = message.role === "assistant";

  return (
    <article className={`nyxus-msg ${message.role}`}>
      {isAssistant && (
        <div className="nyxus-msg-avatar" aria-hidden="true">
          <NyxusIcon size={17} />
        </div>
      )}
      <div className="nyxus-msg-content">
        {isAssistant ? (
          <MarkdownMessage content={message.text} />
        ) : (
          <div className="nyxus-msg-bubble">{message.text}</div>
        )}
      </div>
    </article>
  );
}

export default function MessageList({
  messages,
  isStreaming,
  streamingText,
  messagesEndRef,
  onSuggestion,
}) {
  const showWelcome = messages.length === 0 && !isStreaming;

  return (
    <main aria-live="polite" className="nyxus-messages">
      {showWelcome && <WelcomeScreen onSuggestion={onSuggestion} />}
      {messages.map((message, index) => (
        <Message key={`${message.role}-${index}`} message={message} />
      ))}
      {isStreaming && (
        <article className="nyxus-msg assistant">
          <div className="nyxus-msg-avatar" aria-hidden="true">
            <NyxusIcon size={17} />
          </div>
          <div className="nyxus-msg-content nyxus-streaming-bubble">
            {streamingText ? (
              <div className="nyxus-streaming-text">
                {streamingText}
                <span className="nyxus-cursor" />
              </div>
            ) : (
              <TypingDots />
            )}
          </div>
        </article>
      )}
      <div ref={messagesEndRef} />
    </main>
  );
}
