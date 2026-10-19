import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the real workspace zip produced earlier, or fall back to a tiny stub
let zipBuffer;
const testZip = path.join(__dirname, "test_workspace.zip");
if (fs.existsSync(testZip)) {
  zipBuffer = fs.readFileSync(testZip);
  console.log(`Using zip: ${testZip} (${zipBuffer.length} bytes)`);
} else {
  // Create a 1-file in-memory zip so the test works without a real zip
  const { execSync } = await import("child_process");
  const tmpFile = "/tmp/test_ws_file.txt";
  const tmpZip  = "/tmp/test_ws.zip";
  fs.writeFileSync(tmpFile, "hello nyxus");
  execSync(`zip -j "${tmpZip}" "${tmpFile}"`);
  zipBuffer = fs.readFileSync(tmpZip);
  console.log(`Created stub zip (${zipBuffer.length} bytes)`);
}

const response = await fetch("http://localhost:3000/upload", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",  // ← required so express parses the body
  },
  body: JSON.stringify({
    user_id:      "101",
    api_key:      "abc_123",
    workspace_id: "12345",
    archive:      zipBuffer.toString("base64"),  // ← base64-encoded zip
  }),
});

console.log("Status:", response.status);
console.log("Response:", await response.json());