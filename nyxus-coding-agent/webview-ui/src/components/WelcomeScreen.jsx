import { NyxusIcon } from "./NyxusIcons";

const suggestions = [
  "Explain this codebase",
  "Help me find a bug",
  "Write or improve code",
];

export default function WelcomeScreen({ onSuggestion }) {
  return (
    <section className="nyxus-welcome">
      <div className="nyxus-welcome-icon">
        <NyxusIcon size={48} />
      </div>
      <h1>How can I help?</h1>
      <p>Ask about your code or describe what you want to build.</p>
      <div className="nyxus-suggestions">
        {suggestions.map((suggestion) => (
          <button
            className="nyxus-suggestion"
            key={suggestion}
            onClick={() => onSuggestion(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
