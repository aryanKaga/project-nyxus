import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(),tailwindcss()],
  base: './',   // ← critical: makes asset paths relative (./assets/...) not absolute (/assets/...)
  build: {
    // Output directly into the extension's expected folder.
    // Adjust '../nyxus-coding-agent' to your actual extension folder name.
    outDir: '../nyxus-coding-agent/webview-ui/dist',
    emptyOutDir: true,
  }
})