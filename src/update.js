const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");

const FEED_URL = "https://pablo-asa.pages.dev/update.json";
const SETUP_BASENAME = "PabloASASetup.exe";
const USER_AGENT = "PabloASA-Updater/1.0";
const MANIFEST_TIMEOUT_MS = 12000;
const DOWNLOAD_TIMEOUT_MS = 180000;

function versionTuple(text) {
  return String(text || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((piece) => {
      const digits = piece.replace(/\D/g, "");
      return digits ? parseInt(digits, 10) : 0;
    });
}

function isNewer(remote, local) {
  const a = versionTuple(remote);
  const b = versionTuple(local);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function followGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const go = (target, hops) => {
      if (hops > 8) {
        reject(new Error("Demasiados redirects"));
        return;
      }
      const client = String(target).startsWith("http://") ? http : https;
      const req = client.get(
        target,
        { headers: { "User-Agent": USER_AGENT }, timeout: timeoutMs },
        (res) => {
          const code = res.statusCode || 0;
          const loc = res.headers.location;
          if (code >= 300 && code < 400 && loc) {
            res.resume();
            go(new URL(loc, target).toString(), hops + 1);
            return;
          }
          resolve({ req, res, url: target });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout"));
      });
      req.on("error", reject);
    };
    go(url, 0);
  });
}

async function fetchManifest() {
  const { res } = await followGet(FEED_URL, MANIFEST_TIMEOUT_MS);
  if (res.statusCode === 404) return { missing: true };
  if (res.statusCode < 200 || res.statusCode >= 300) {
    res.resume();
    throw new Error("Update " + res.statusCode);
  }
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", reject);
  });
  const data = JSON.parse(raw);
  const version = String(data.version || "").trim();
  const url = String(data.url || "").trim();
  if (!version || !url) throw new Error("update.json inválido");
  return {
    version,
    url,
    sha256: String(data.sha256 || "").trim(),
    notes: String(data.notes || ""),
  };
}

async function downloadInstaller(url, dest, expectedSha, onProgress) {
  const { res } = await followGet(url, DOWNLOAD_TIMEOUT_MS);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    res.resume();
    throw new Error("No se pudo descargar el update (" + res.statusCode + ")");
  }
  const tmp = dest + ".part";
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const hasher = crypto.createHash("sha256");
  const total = Number(res.headers["content-length"] || 0);
  let done = 0;
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmp);
    res.on("data", (chunk) => {
      hasher.update(chunk);
      file.write(chunk);
      done += chunk.length;
      if (onProgress) onProgress(done, total);
    });
    res.on("end", () => file.end((err) => (err ? reject(err) : resolve())));
    res.on("error", reject);
    file.on("error", reject);
  });
  const digest = hasher.digest("hex");
  if (expectedSha && digest.toLowerCase() !== expectedSha.toLowerCase()) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw new Error("El instalador descargado no coincide (sha256).");
  }
  fs.renameSync(tmp, dest);
  return dest;
}

function setupDest() {
  return path.join(os.tmpdir(), SETUP_BASENAME);
}

function launchSilent(setupPath) {
  spawn(setupPath, ["/S"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

module.exports = {
  FEED_URL,
  isNewer,
  fetchManifest,
  downloadInstaller,
  setupDest,
  launchSilent,
};
