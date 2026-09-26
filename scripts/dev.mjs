// Starts db + server + client from the project's real (long) path. Launchers that pass a
// Windows 8.3 short path (C:\Users\NAME~1\...) otherwise break Vite's file watcher.
import { realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
const child = spawn("npm run dev", { cwd: root, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
