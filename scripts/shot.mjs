/**
 * Headless screenshots of the running Entry web app using installed Chrome/Chromium
 * over the Chrome DevTools Protocol (no external browser download required).
 *
 * Usage:
 *   node scripts/shot.mjs [--size 1440x900] [--scale 2] [--theme dark] [--url http://localhost:3100] <steps...>
 *
 * Steps (run in order):
 *   --goto /pricing            navigate to path or URL
 *   --wait 800                 pause (ms)
 *   --click "css"              click first matching element
 *   --shot out.png             capture viewport PNG (or "out.png@css" for one element)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let size = [1440, 900];
let baseUrl = process.env.ENTRY_URL || "http://localhost:3100";
let scale = 2;
let theme = "dark";
const steps = [];

for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const val = args[i + 1];
  if (key === "--size") size = val.split("x").map(Number);
  else if (key === "--url") baseUrl = val;
  else if (key === "--scale") scale = Number(val);
  else if (key === "--theme") theme = val;
  else steps.push([key.replace(/^--/, ""), val]);
}

const candidates = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  throw new Error("No Chrome/Chromium binary found in /usr/bin");
}

const port = 9222 + Math.floor(Math.random() * 500);
const chrome = spawn(
  executablePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    `--window-size=${size[0]},${size[1]}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function waitForWsUrl() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for Chrome DevTools endpoint");
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (e) => reject(e));
    });
    this.ws.addEventListener("message", (evt) => {
      const msg = JSON.parse(String(evt.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

try {
  const wsUrl = await waitForWsUrl();
  const cdp = new CdpClient(wsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: size[0],
    height: size[1],
    deviceScaleFactor: scale,
    mobile: size[0] < 768,
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }],
  });

  const navigate = async (target) => {
    const full = target.startsWith("http")
      ? target
      : new URL(target, baseUrl).toString();
    await cdp.send("Page.navigate", { url: full });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (theme === "dark") {
      await cdp.send("Runtime.evaluate", {
        expression: `document.documentElement.classList.add('dark');`,
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  if (steps.length === 0 || steps[0][0] !== "goto") {
    await navigate(baseUrl);
  }

  for (const [kind, val] of steps) {
    if (kind === "goto") {
      await navigate(val);
    } else if (kind === "wait") {
      await new Promise((resolve) => setTimeout(resolve, Number(val)));
    } else if (kind === "click") {
      await cdp.send("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(val)})?.click()`,
      });
    } else if (kind === "shot") {
      const [file, sel] = val.split("@");
      mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      let clip;
      if (sel) {
        const res = await cdp.send("Runtime.evaluate", {
          expression: `(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 } : null; })()`,
          returnByValue: true,
        });
        clip = res.result?.value ?? undefined;
      }
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        ...(clip ? { clip } : {}),
      });
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      console.log("shot ->", file);
    }
  }

  cdp.close();
} finally {
  chrome.kill("SIGKILL");
}
