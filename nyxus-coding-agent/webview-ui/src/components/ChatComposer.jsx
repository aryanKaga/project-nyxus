import { SendIcon } from "./NyxusIcons";

export default function ChatComposer({
  input,
  isStreaming,
  textareaRef,
  onInputChange,
  onKeyDown,
  onSend,
}) {
  return (
    <footer className="nyxus-input-area">
      <div className="nyxus-input-wrapper">
        <textarea
          ref={textareaRef}
          aria-label="Message Nyxus"
          className="nyxus-textarea"
          disabled={isStreaming}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder="Message Nyxus..."
          rows={1}
          value={input}
        />
        <button
          aria-label="Send message"
          className="nyxus-send-btn"
          disabled={!input.trim() || isStreaming}
          onClick={onSend}
          type="button"
        >
          <SendIcon />
        </button>
      </div>
      <p className="nyxus-input-hint">Enter to send · Shift+Enter for a new line</p>
    </footer>
  );
}
