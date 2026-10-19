# Nyxus Coding Agent Replica

The Nyxus sidebar loads the React chat interface and indexes the open workspace
when the sidebar opens. Indexing writes `.nyxus/repo-mapping.json` and
`.nyxus/directory_structure.json`; its current status appears in the sidebar.
The Nyxus server remains disconnected, and sending a message reports that
server access is disabled.

When connected to the configured backend, turn on **README mode** above the
composer to have Nyxus's README-writing role format each response as Markdown.
The extension saves the latest formatted response to `answer.md` in the active
workspace and opens its VS Code Markdown preview. Responses appear as
collapsible `answer.md` envelopes in the chat; opening an envelope also opens
the saved preview. The mode preference is retained with the workspace chat.

## Build and test

Run `npm test` in this folder to build the React bundle and run the extension
tests. Or run `npm run build` to build only the UI.

## Run in VS Code

1. Open this folder in VS Code and run `npm run build`.
2. Press `F5` to launch the Extension Development Host.
3. Select the **Nyxus Replica** icon in the Activity Bar. The chat UI should
   render in its sidebar.
4. Confirm workspace indexing completes in the sidebar. Try sending a
   message; the UI should report that server connections are disabled.

**Nyxus Test: Say Hi** remains available from the Command Palette as a basic
extension-host check.
