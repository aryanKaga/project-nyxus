# Nyxus Coding Agent Replica

The Nyxus sidebar sends a ZIP snapshot of the open Git repository to the
workspace receiver. Before creating the archive, the extension stages all
changes using Git, so tracked changes and new non-ignored files are committed;
ignored untracked files are left out. Existing `.gitignore` and Git global
excludes are respected. If the repository has no root `.gitignore`, the
extension creates a small general-purpose one before staging files.

The extension runs `git add --all` and creates a local commit when there are
staged changes, then sends the committed repository files over Socket.IO as a
compressed ZIP binary payload. It does not push to or change any remote.
The receiver accepts compressed archives up to 250 MB and rejects unsafe
archive paths and symbolic links that point outside the workspace.

## Start the receiver

From the sibling `hybridbackend` folder, install dependencies and run:

```sh
python -m pip install -r requirements.txt
python server.py
```

The receiver listens on `127.0.0.1:3000` by default, validates the configured
API key, safely unpacks the archive, and stores each transfer in
`hybridbackend/workspaces/<workspace-id>/`. Set `NYXUS_API_KEY` to the same
value stored through **Nyxus: Set API Key** in VS Code. The key is kept in
VS Code SecretStorage and does not appear in settings. To accept connections
from another machine, configure `NYXUS_HOST` and protect the receiver with
appropriate network controls.

## Build and test

Run `npm test` in this folder to build the React bundle and run the extension
tests. Or run `npm run build` to build only the UI.

Run `python -m unittest test_workspace_receiver.py` from `hybridbackend` to
test safe archive extraction.

## Run in VS Code

1. Open this folder in VS Code and run `npm run build`.
2. Start the `hybridbackend` receiver.
3. Press `F5` to launch the Extension Development Host.
4. Select the **Nyxus Replica** icon in the Activity Bar and wait for the Git
   workspace transfer to complete.

**Nyxus Test: Say Hi** remains available from the Command Palette as a basic
extension-host check.
