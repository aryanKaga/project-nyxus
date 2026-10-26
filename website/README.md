# Nyxus Black & White Web Portal

A monochromatic, aesthetic web portal and developer onboarding console for **Nyxus: Autonomous Coding Agent & Cloud-Native Workspace Engine**.

## Features

- **Black & White Minimalist Aesthetic**: High-contrast, dark mode monochrome styling built with Tailwind CSS, custom Geist fonts, subtle tech grid backgrounds, and glassmorphism.
- **Google OAuth 2.0 Integration**:
  - Direct integration with Google Identity Services (GIS).
  - Configurable `VITE_GOOGLE_CLIENT_ID` (via `.env` or in-app modal).
  - Instant One-Click Developer Profile fallback for rapid local testing without waiting for Google Cloud Console setup.
- **Email as User ID**:
  - Automatically provisions the user's Google email as their permanent `User ID` (`user_id = email`).
  - Displays a high-tech "Nyxus Pass" credential card with gateway endpoints and security scopes.
- **Deep-Link Extension Configuration**:
  - **One-Click Extension Launch**: Launches the VS Code extension using the registered URI protocol handler:
    ```
    vscode://aryanKaga.nyxus-coding-agent-replica/auth?userId=<email>
    ```
  - Also provides deep-link launchers for **Cursor** (`cursor://...`) and **VS Code Insiders** (`vscode-insiders://...`).
  - Provides manual `settings.json` copy and CLI command `code --command nyxusReplica.openSidebar`.
- **Live Terminal & Architecture Telemetry**:
  - Interactive simulator showcasing workspace staging, K3s ephemeral pod allocation, LangGraph multi-agent cycles, and streaming `answer.md`.

## Getting Started

### 1. Install dependencies & run development server
```bash
cd website
npm install
npm run dev
```

Visit `http://localhost:5173` in your browser.

### 2. Configure Google OAuth (Optional)
To use your real Google Cloud OAuth 2.0 Client ID:
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Add `http://localhost:5173` to **Authorized JavaScript origins**.
4. Set `VITE_GOOGLE_CLIENT_ID` in `website/.env` or configure it directly in the website's auth modal.
