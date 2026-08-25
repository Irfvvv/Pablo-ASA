const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const FEED_URL = "https://github.com/Irfvvv/Pablo-ASA/releases/latest/download/update.json";
const SETUP_BASENAME = "PabloASASetup.exe";

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

async function fetchManifest() {
  const res = await fetch(FEED_URL, {
    headers: { "User-Agent": "Pablo-ASA", Accept: "application/json" },
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error("GitHub " + res.status);
  const data = await res.json();
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
  const res = await fetch(url, { headers: { "User-Agent": "Pablo-ASA" }, redirect: "follow" });
  if (!res.ok) throw new Error("No se pudo descargar el update (" + res.status + ")");
  const tmp = dest + ".part";
  const hasher = crypto.createHash("sha256");
  const total = Number(res.headers.get("content-length") || 0);
  let done = 0;
  const file = fs.createWriteStream(tmp);

  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      hasher.update(chunk.value);
      file.write(Buffer.from(chunk.value));
      done += chunk.value.length;
      if (onProgress) onProgress(done, total);
    }
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    hasher.update(buf);
    file.write(buf);
    done = buf.length;
    if (onProgress) onProgress(done, buf.length);
  }

  await new Promise((resolve, reject) => {
    file.end((err) => (err ? reject(err) : resolve()));
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
  spawn("cmd.exe", ["/c", `timeout /t 3 /nobreak >nul & start "" /wait "${setupPath}" /S`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();
}

function isSetupRunning() {
  const r = spawnSync("tasklist", ["/FI", "IMAGENAME eq PabloASASetup.exe", "/NH"], {
    windowsHide: true,
    encoding: "utf8",
  });
  return /PabloASASetup\.exe/i.test(String(r.stdout || ""));
}

module.exports = {
  FEED_URL,
  isNewer,
  fetchManifest,
  downloadInstaller,
  setupDest,
  launchSilent,
  isSetupRunning,
};
