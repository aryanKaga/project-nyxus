export default function ChatStatus({
  connectionMessage,
  workspaceIndexStatus,
}) {
  return (
    <section className="nyxus-status" aria-label="Nyxus status">
      {connectionMessage && (
        <p className="nyxus-status-message is-connection" role="status">
          {connectionMessage}
        </p>
      )}
      <p className="nyxus-status-message is-workspace" role="status">
        {workspaceIndexStatus}
      </p>
    </section>
  );
}
