const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const asa = require("./asa");
const { GROUPS, COMMANDS } = require("./commands");
const clicker = require("./clicker");
const updater = require("./update");

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
    lastFov: 170,
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
  const names = ["PabloASASetup.exe", "Pablo ASA Setup.exe"];
  const dirs = [path.join(process.cwd(), "dist"), path.join(app.getAppPath(), "dist")];
  for (const dir of dirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) return full;
    }
  }
  return "";
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
      runAutoUpdate(false).catch(() => {});
    }, 1600);
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
    if (Number.isFinite(Number(currentCfg.lastFov))) fov = Math.round(Number(currentCfg.lastFov));
    else if (pathOk) fov = asa.readFov(asaPath);
  } catch {
    fov = 90;
  }
  return {
    version: app.getVersion(),
    config: currentCfg,
    asaOk: pathOk,
    fov,
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
  currentCfg = { ...loadConfig(), lastFov: r.degrees };
  saveConfig(currentCfg);
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

let updating = false;

async function runAutoUpdate(force) {
  if (updating) return { ok: true, busy: true };
  send("update-status", { state: "checking" });
  let manifest;
  try {
    manifest = await updater.fetchManifest();
  } catch (err) {
    if (app.isPackaged) {
      try {
        configureUpdater();
        await autoUpdater.checkForUpdates();
        return ok({ packaged: true });
      } catch (fallbackErr) {
        const msg = friendlyUpdateError(fallbackErr);
        send("update-status", { state: "error", message: msg });
        return fail(msg);
      }
    }
    const msg = friendlyUpdateError(err);
    send("update-status", { state: "error", message: msg });
    return fail(msg);
  }

  if (manifest.missing) {
    const msg = "Aún no hay update.json en GitHub Releases.";
    send("update-status", { state: "error", message: msg });
    return fail(msg);
  }

  if (!updater.isNewer(manifest.version, app.getVersion())) {
    const msg = force ? "Ya estás en la última versión (v" + app.getVersion() + ")" : "Estás al día";
    send("update-status", { state: "current", message: msg, version: manifest.version });
    return ok({ version: manifest.version, current: true, message: msg });
  }

  if (!app.isPackaged) {
    const msg = "Hay v" + manifest.version + ". npm start no se autoinstala: usa el acceso directo Pablo ASA.";
    send("update-status", { state: "current", message: msg, version: manifest.version });
    return ok({ version: manifest.version, packaged: false, message: msg });
  }

  updating = true;
  send("update-status", { state: "available", version: manifest.version });
  try {
    const dest = updater.setupDest();
    await updater.downloadInstaller(manifest.url, dest, manifest.sha256, (done, total) => {
      const percent = total ? (done / total) * 100 : 0;
      send("update-status", { state: "downloading", percent, version: manifest.version });
    });
    send("update-status", { state: "ready", version: manifest.version });
    updater.launchSilent(dest);
    setTimeout(() => app.quit(), 50);
    return ok({ version: manifest.version, installing: true });
  } catch (err) {
    updating = false;
    const msg = friendlyUpdateError(err);
    send("update-status", { state: "error", message: msg });
    return fail(msg);
  }
}

handle("check-updates", () => runAutoUpdate(true));

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
