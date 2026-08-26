const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const asa = require("./asa");
const { GROUPS, COMMANDS } = require("./commands");
const clicker = require("./clicker");
const updater = require("./update");

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
}

app.on("second-instance", () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function defaultConfig() {
  return {
    asaPath: asa.detectAsaPath(),
    setupDone: false,
    lastFov: 170,
    cmdQueue: "",
    clicker: {
      button: "Izquierdo",
      intervalMs: 100,
      maxClicks: 0,
      toggle: "F6",
      toggleVk: 0x75,
    },
  };
}

function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    const base = defaultConfig();
    const clickerCfg = { ...base.clicker, ...(saved.clicker || {}) };
    if (!["Izquierdo", "Derecho", "Central", "Atrás", "Adelante"].includes(clickerCfg.button)) {
      clickerCfg.button = "Izquierdo";
    }
    if (!clickerCfg.toggle) clickerCfg.toggle = "F6";
    if (!clickerCfg.toggleVk) clickerCfg.toggleVk = 0x75;
    return { ...base, ...saved, clicker: clickerCfg };
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
  return updater.FEED_URL.replace(/update\.json$/, "");
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
  if (!gotLock) return;
  currentCfg = loadConfig();
  createWindow();
  clicker.init(
    (st) => send("clicker-status", st),
    () => (loadConfig().clicker || {}),
    (hit) => {
      const cfg = loadConfig();
      const next = { ...cfg.clicker, toggle: hit.name, toggleVk: hit.vk };
      currentCfg = { ...cfg, clicker: next };
      saveConfig(currentCfg);
      send("clicker-bound", next);
      send("clicker-status", clicker.status());
    }
  );
  if (app.isPackaged) {
    setTimeout(() => {
      runAutoUpdate(false).catch(() => {});
    }, 1600);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  clicker.shutdown();
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  clicker.shutdown();
});

function friendlyUpdateError(err) {
  const raw = String(err?.message || err || "");
  if (/timeout/i.test(raw)) {
    return "Timeout buscando update. Prueba otra vez.";
  }
  if (/404/i.test(raw) || /missing/i.test(raw)) {
    return "Aún no hay update publicado.";
  }
  if (/ENOTFOUND|ECONNREFUSED|net::/i.test(raw)) {
    return "No hay conexión. Prueba más tarde.";
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

handle("run-console", async (text) => {
  const win32 = require("./win32");
  await win32.sendToConsole(text);
  return ok();
});

handle("open-external", (url) => {
  shell.openExternal(url);
  return ok();
});

let updating = false;

async function runAutoUpdate(force) {
  if (updating) return { ok: true, busy: true };
  if (force) send("update-status", { state: "checking" });
  let manifest;
  try {
    manifest = await updater.fetchManifest();
  } catch (err) {
    if (!force) return ok({ skipped: true });
    const msg = friendlyUpdateError(err);
    send("update-status", { state: "error", message: msg });
    return fail(msg);
  }

  if (manifest.missing) {
    if (!force) return ok({ skipped: true });
    const msg = "Aún no hay update publicado.";
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
    setTimeout(() => app.quit(), 500);
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
  if (!exe) throw new Error("No encuentro PabloASASetup en dist. Ejecuta npm run dist.");
  shell.openPath(exe);
  return ok({ path: exe });
});

handle("clicker-start", (opts) => {
  const cfg = loadConfig();
  const next = { ...cfg.clicker, ...opts };
  currentCfg = { ...cfg, clicker: next };
  saveConfig(currentCfg);
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

handle("clicker-save", (opts) => {
  const cfg = loadConfig();
  const next = { ...cfg.clicker, ...opts };
  currentCfg = { ...cfg, clicker: next };
  saveConfig(currentCfg);
  return ok(next);
});

handle("clicker-bind", () => {
  clicker.beginBind();
  return ok({ capturing: true });
});
