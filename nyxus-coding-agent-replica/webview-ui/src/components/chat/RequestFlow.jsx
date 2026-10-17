export default function RequestFlow({ events }) {
  return (
    <details className="nyxus-flow">
      <summary>Request flow ({events.length})</summary>
      <ol>
        {events.map((entry, index) => (
          <li key={`${entry.time}-${index}`}>
            <time>{entry.time}</time>
            <code>{entry.event}</code>
          </li>
        ))}
        {events.length === 0 && <li>Waiting for connection events…</li>}
      </ol>
    </details>
  );
}
