const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const asa = require("./asa");
const { GROUPS, COMMANDS } = require("./commands");
const clicker = require("./clicker");

const UPDATE_FEED = {
  provider: "github",
  owner: "Irfvvv",
  repo: "Pablo-ASA",
};

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function defaultConfig() {
  return {
    asaPath: asa.detectAsaPath(),
    setupDone: false,
    clicker: {
      type: "mouse",
      button: 0,
      vk: 0x45,
      label: "Clic izquierdo",
      intervalMs: 100,
      jitterMs: 20,
      onlyAsa: true,
      toggle: "F8",
    },
  };
}

function loadConfig() {
  try {
    return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    return defaultConfig();
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

let win;
let currentCfg = null;

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function releaseUrl() {
  return `https://github.com/${UPDATE_FEED.owner}/${UPDATE_FEED.repo}/releases`;
}

function localSetupPath() {
  const names = [`PabloASA-Setup-${app.getVersion()}.exe`, "PabloASA-Setup-1.0.0.exe"];
  const dirs = [path.join(process.cwd(), "dist"), path.join(app.getAppPath(), "dist")];
  for (const dir of dirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) return full;
    }
  }
  return "";
}

async function fetchLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${UPDATE_FEED.owner}/${UPDATE_FEED.repo}/releases/latest`, {
    headers: { "User-Agent": "Pablo-ASA", Accept: "application/vnd.github+json" },
  });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error("GitHub " + res.status);
  const data = await res.json();
  return {
    version: String(data.tag_name || data.name || "").replace(/^v/i, ""),
    url: data.html_url || releaseUrl(),
  };
}

function configureUpdater() {
  autoUpdater.setFeedURL(UPDATE_FEED);
  return true;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#101218",
    title: "Pablo ASA",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  currentCfg = loadConfig();
  createWindow();
  bindClickerToggle(currentCfg.clicker?.toggle || "F8");
  if (app.isPackaged) {
    configureUpdater();
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 2500);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  clicker.stop();
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  clicker.stop();
  globalShortcut.unregisterAll();
});

autoUpdater.on("checking-for-update", () => send("update-status", { state: "checking" }));
autoUpdater.on("update-available", (info) => send("update-status", { state: "available", version: info.version }));
autoUpdater.on("update-not-available", () => send("update-status", { state: "current" }));
autoUpdater.on("download-progress", (p) => send("update-status", { state: "downloading", percent: p.percent }));
autoUpdater.on("update-downloaded", (info) => {
  send("update-status", { state: "ready", version: info.version });
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch {
      /* el botón Instalar sigue disponible */
    }
  }, 1800);
});
autoUpdater.on("error", (err) => send("update-status", { state: "error", message: friendlyUpdateError(err) }));

function friendlyUpdateError(err) {
  const raw = String(err?.message || err || "");
  if (/404/i.test(raw) || /releases\.atom/i.test(raw)) {
    return "Aún no existe el repo/releases en GitHub. El auto-update empezará cuando Irfvvv/Pablo-ASA sea público y tenga un Release.";
  }
  if (/ENOTFOUND|ECONNREFUSED|net::/i.test(raw)) {
    return "No hay conexión con GitHub. Prueba más tarde.";
  }
  return raw.split("\n")[0].slice(0, 180);
}

function ok(extra) {
  return extra && typeof extra === "object" ? { ok: true, ...extra } : { ok: true };
}

function fail(err) {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return fail(err);
    }
  });
}

handle("get-state", () => {
  currentCfg = loadConfig();
  const asaPath = currentCfg.asaPath || "";
  const pathOk = Boolean(asaPath && asa.exists(asaPath));
  let fov = 90;
  try {
    if (pathOk) fov = asa.readFov(asaPath);
  } catch {
    fov = 90;
  }
  return {
    version: app.getVersion(),
    config: currentCfg,
    asaOk: pathOk,
    fov,
    fovBase: asa.ASA_CAMERA_FOV_BASE,
    execs: pathOk ? asa.listExecs(asaPath) : [],
    cleanExec: asa.CLEAN_EXEC,
    commandGroups: GROUPS,
    commands: COMMANDS,
    packaged: app.isPackaged,
    setupExe: localSetupPath(),
    releasesUrl: releaseUrl(),
    clicker: clicker.status(),
  };
});

handle("save-config", (patch) => {
  currentCfg = { ...loadConfig(), ...patch };
  saveConfig(currentCfg);
  return ok();
});

handle("pick-folder", async (title) => {
  const r = await dialog.showOpenDialog(win, { title: title || "Carpeta", properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

handle("detect-asa", () => {
  const found = asa.detectAsaPath();
  if (!found) return fail("No encontré ASA en Steam");
  currentCfg = { ...loadConfig(), asaPath: found };
  saveConfig(currentCfg);
  return ok({ path: found });
});

handle("set-fov", async (value) => {
  send("fov-status", { message: "Cerrando ASA si está abierto…" });
  const r = await asa.applyFov(loadConfig().asaPath, value);
  return ok(r);
});

handle("read-exec", (filename) => {
  return ok({ content: asa.readExec(loadConfig().asaPath, filename) });
});

handle("write-exec", (filename, contents) => {
  asa.writeExec(loadConfig().asaPath, filename, contents);
  return ok();
});

handle("write-clean-exec", (filename) => {
  asa.writeCleanExec(loadConfig().asaPath, filename || "4.txt");
  return ok();
});

handle("clear-console", () => {
  asa.clearConsoleHistory(loadConfig().asaPath);
  return ok();
});

handle("launch-asa", async () => {
  await shell.openExternal("steam://rungameid/2399830");
  return ok();
});

handle("open-folder", (which) => {
  const cfg = loadConfig();
  if (which === "config") asa.openFolder(asa.configDir(cfg.asaPath));
  else if (which === "binaries") asa.openFolder(asa.binariesDir(cfg.asaPath));
  else if (which === "asa") asa.openFolder(cfg.asaPath);
  else throw new Error("Carpeta desconocida");
  return ok();
});

handle("copy-text", (text) => {
  require("electron").clipboard.writeText(String(text || ""));
  return ok();
});

handle("open-external", (url) => {
  shell.openExternal(url);
  return ok();
});

handle("check-updates", async () => {
  send("update-status", { state: "checking" });
  let latest = null;
  try {
    latest = await fetchLatestRelease();
  } catch (err) {
    send("update-status", { state: "error", message: friendlyUpdateError(err) });
    return fail(friendlyUpdateError(err));
  }

  if (latest.missing) {
    const msg =
      "Aún no hay releases en GitHub (Irfvvv/Pablo-ASA). Cuando el repo esté público, el instalador se actualiza solo. Este npm start no instala updates.";
    send("update-status", { state: "error", message: msg });
    return fail(msg);
  }

  if (app.isPackaged) {
    configureUpdater();
    try {
      const r = await autoUpdater.checkForUpdates();
      return ok({ version: r?.updateInfo?.version || latest.version, packaged: true });
    } catch (err) {
      const msg = friendlyUpdateError(err);
      send("update-status", { state: "error", message: msg });
      return fail(msg);
    }
  }

  const msg = `GitHub tiene v${latest.version}. npm start no se autoinstala: usa el Setup (PabloASA-Setup) y a partir de ahí sí se actualiza solo.`;
  send("update-status", { state: "current", message: msg, version: latest.version });
  return ok({ version: latest.version, packaged: false, url: latest.url, message: msg });
});

handle("open-releases", () => {
  shell.openExternal(releaseUrl());
  return ok();
});

handle("open-setup", () => {
  const exe = localSetupPath();
  if (!exe) throw new Error("No encuentro PabloASA-Setup en dist. Ejecuta npm run dist.");
  shell.openPath(exe);
  return ok({ path: exe });
});

handle("install-update", () => {
  autoUpdater.quitAndInstall();
  return ok();
});

function bindClickerToggle(accelerator) {
  globalShortcut.unregisterAll();
  const acc = accelerator || "F8";
  const okBind = globalShortcut.register(acc, () => {
    if (clicker.status().running) {
      clicker.stop();
    } else {
      const cfg = loadConfig();
      clicker.start(cfg.clicker || {});
    }
    send("clicker-status", clicker.status());
  });
  return okBind;
}

handle("clicker-start", (opts) => {
  const cfg = loadConfig();
  const next = { ...cfg.clicker, ...opts };
  currentCfg = { ...cfg, clicker: next };
  saveConfig(currentCfg);
  bindClickerToggle(next.toggle);
  const st = clicker.start(next);
  send("clicker-status", st);
  return ok(st);
});

handle("clicker-stop", () => {
  clicker.stop();
  const st = clicker.status();
  send("clicker-status", st);
  return ok(st);
});

handle("clicker-status", () => clicker.status());

handle("clicker-bind-toggle", (accelerator) => {
  const cfg = loadConfig();
  const next = { ...cfg.clicker, toggle: accelerator || "F8" };
  currentCfg = { ...cfg, clicker: next };
  saveConfig(currentCfg);
  const bound = bindClickerToggle(next.toggle);
  if (!bound) throw new Error("Esa tecla de toggle no se pudo registrar (igual está pillada)");
  return ok({ toggle: next.toggle });
});
