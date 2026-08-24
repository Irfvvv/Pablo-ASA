const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");
const asa = require("./asa");
const { GROUPS, COMMANDS } = require("./commands");

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
  if (process.platform !== "darwin") app.quit();
});

autoUpdater.on("checking-for-update", () => send("update-status", { state: "checking" }));
autoUpdater.on("update-available", (info) => send("update-status", { state: "available", version: info.version }));
autoUpdater.on("update-not-available", () => send("update-status", { state: "current" }));
autoUpdater.on("download-progress", (p) => send("update-status", { state: "downloading", percent: p.percent }));
autoUpdater.on("update-downloaded", (info) => send("update-status", { state: "ready", version: info.version }));
autoUpdater.on("error", (err) => send("update-status", { state: "error", message: String(err) }));

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
    execs: pathOk ? asa.listExecs(asaPath) : [],
    cleanExec: asa.CLEAN_EXEC,
    commandGroups: GROUPS,
    commands: COMMANDS,
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

handle("set-fov", (value) => {
  const r = asa.writeFov(loadConfig().asaPath, value);
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

handle("launch-asa", () => {
  asa.launchAsa(loadConfig().asaPath);
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
  if (!app.isPackaged) {
    return fail("El auto-update solo funciona en el instalador, no en npm start");
  }
  configureUpdater();
  const r = await autoUpdater.checkForUpdates();
  return ok({ version: r?.updateInfo?.version });
});

handle("install-update", () => {
  autoUpdater.quitAndInstall();
  return ok();
});
