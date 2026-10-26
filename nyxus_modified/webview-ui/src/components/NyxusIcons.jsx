function NyxusIcon({ size = 32, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      className={className}
    >
      <g
        transform="translate(256, 256) scale(1.16) translate(-293, -308)"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          strokeWidth="26"
          d="M111 253 C101 225 99 194 106 158 C135 161 166 177 193 198 L220 150 C240 165 254 188 263 210 C282 204 301 204 321 210 C344 217 360 208 382 193 L405 178"
        />
        <path
          strokeWidth="26"
          d="M111 253 C120 275 135 291 153 302 C132 324 119 346 111 369 C136 356 155 335 170 315 C161 343 159 371 165 397 C175 380 189 361 207 347 C196 374 195 402 207 425 C220 450 246 462 269 481"
        />
        <path
          strokeWidth="26"
          d="M191 198 C210 214 224 224 245 225 C270 226 290 219 312 218 C339 217 360 204 382 193"
        />
        <path
          strokeWidth="26"
          d="M312 218 C341 226 369 215 391 197 C403 187 412 178 420 171"
        />
        <path
          strokeWidth="22"
          d="M244 246 C272 253 303 251 329 240 C359 228 382 208 399 188"
        />
        <path strokeWidth="18" d="M167 315 C186 302 198 284 205 266" />
        <path strokeWidth="18" d="M207 347 C223 330 236 314 243 294" />
        <path strokeWidth="18" d="M207 425 C226 414 241 399 251 381" />
        <path strokeWidth="18" d="M271 232 C286 219 302 218 316 224" />
        <path strokeWidth="18" d="M121 174 C143 179 161 190 176 204" />
        <path
          fill="currentColor"
          stroke="none"
          d="M404 176 C414 166 426 160 435 162 C442 164 445 177 444 189 C432 191 419 187 404 176 Z"
        />
        <path strokeWidth="16" d="M455 157 C465 150 467 141 463 134" />
        <path strokeWidth="16" d="M470 174 C482 169 486 160 483 152" />
      </g>
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
function SettingsIcon({ size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChatIcon({ size = 16 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function RefreshIcon({ size = 14, className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function StageIcon({ size = 14 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
}

function UnstageIcon({ size = 14 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 21h14" /></svg>;
}

function KeyIcon({ size = 14 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="5" /><path d="m11.5 11.5 9-9M17 6l2 2M14 9l2 2" /></svg>;
}

function EnvelopeIcon({ size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function EnvelopeOpenIcon({ size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
    >
      <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
      <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
      <path d="M2 10l5.8 4.3" />
      <path d="M22 10l-5.8 4.3" />
    </svg>
  );
}

export {
  NyxusIcon,
  SendIcon,
  TypingDots,
  SettingsIcon,
  ChatIcon,
  RefreshIcon,
  StageIcon,
  UnstageIcon,
  KeyIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
};
