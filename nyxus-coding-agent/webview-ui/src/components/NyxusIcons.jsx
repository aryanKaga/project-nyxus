function NyxusIcon({ size = 32 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
    >
      <circle cx="64" cy="64" r="62" fill="currentColor" opacity="0.1" />
      <circle
        cx="64"
        cy="64"
        r="58"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="38" y="30" width="52" height="50" rx="8" fill="currentColor" opacity="0.9" />
      <circle cx="48" cy="45" r="6" fill="currentColor" opacity="0.3" />
      <circle cx="48" cy="45" r="3" fill="currentColor" />
      <circle cx="80" cy="45" r="6" fill="currentColor" opacity="0.3" />
      <circle cx="80" cy="45" r="3" fill="currentColor" />
      <line
        x1="45"
        y1="28"
        x2="42"
        y2="15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="42" cy="12" r="2" fill="currentColor" />
      <line
        x1="83"
        y1="28"
        x2="86"
        y2="15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="86" cy="12" r="2" fill="currentColor" />
      <path
        d="M 55 58 Q 64 62 73 58"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="44" y="78" width="40" height="35" rx="6" fill="currentColor" opacity="0.7" />
      <rect x="28" y="90" width="14" height="8" rx="4" fill="currentColor" opacity="0.8" />
      <rect x="86" y="90" width="14" height="8" rx="4" fill="currentColor" opacity="0.8" />
      <circle cx="64" cy="110" r="2.5" fill="#00ff88" opacity="0.9" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function TypingDots() {
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 4,
        alignItems: "center",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--nyxus-accent)",
            animation: "nyxusBounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}
export { NyxusIcon, SendIcon, TypingDots };