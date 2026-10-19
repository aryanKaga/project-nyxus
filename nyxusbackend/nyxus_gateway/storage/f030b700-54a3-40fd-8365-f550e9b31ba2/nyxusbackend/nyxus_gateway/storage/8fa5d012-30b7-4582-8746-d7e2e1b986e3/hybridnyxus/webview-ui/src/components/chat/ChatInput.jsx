import { useRef, useState } from "react";
import { SendIcon } from "../NyxusIcons";

export default function ChatInput({ disabled, onSend }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  function handleChange(event) {
    setInput(event.target.value);
    event.target.style.height = "42px";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
  }

  function submit() {
    if (disabled || !input.trim()) {
      return;
    }
    onSend(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "42px";
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="nyxus-input-area"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="nyxus-input-wrapper">
        <textarea
          ref={textareaRef}
          aria-label="Message Nyxus"
          className="nyxus-textarea"
          placeholder="Ask Nyxus anything..."
          rows={1}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          className="nyxus-send-btn"
          type="submit"
          aria-label="Send message"
          disabled={!input.trim() || disabled}
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}
