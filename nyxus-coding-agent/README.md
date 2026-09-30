# Nyxus Coding Agent

This starter milestone isolates VS Code extension activation. Opening the
Nyxus sidebar displays a simple greeting; it does not yet start workspace
indexing, connect to the Nyxus server, or load the chat webview bundle.

## Run the extension locally

1. Open this extension folder in VS Code.
2. Press `F5` and choose **Run Extension** to open an Extension Development
   Host window.
3. In that new window, select the **Nyxus** icon in the Activity Bar. The
   sidebar should display **Hi! Nyxus is ready.**

To open the view from the Command Palette, run **Open Nyxus Sidebar**.
Run `npm run test:unit` to test activation, greeting rendering, and the open
command without launching an Extension Development Host.

## Requirements

- VS Code 1.120 or later.
