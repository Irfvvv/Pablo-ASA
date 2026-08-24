const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pablo", {
  getState: () => ipcRenderer.invoke("get-state"),
  saveConfig: (patch) => ipcRenderer.invoke("save-config", patch),
  pickFolder: (title) => ipcRenderer.invoke("pick-folder", title),
  detectAsa: () => ipcRenderer.invoke("detect-asa"),
  setFov: (value) => ipcRenderer.invoke("set-fov", value),
  readExec: (filename) => ipcRenderer.invoke("read-exec", filename),
  writeExec: (filename, contents) => ipcRenderer.invoke("write-exec", filename, contents),
  writeCleanExec: (filename) => ipcRenderer.invoke("write-clean-exec", filename),
  clearConsole: () => ipcRenderer.invoke("clear-console"),
  launchAsa: () => ipcRenderer.invoke("launch-asa"),
  openFolder: (which) => ipcRenderer.invoke("open-folder", which),
  copyText: (text) => ipcRenderer.invoke("copy-text", text),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  openReleases: () => ipcRenderer.invoke("open-releases"),
  openSetup: () => ipcRenderer.invoke("open-setup"),
  clickerStart: (opts) => ipcRenderer.invoke("clicker-start", opts),
  clickerStop: () => ipcRenderer.invoke("clicker-stop"),
  clickerStatus: () => ipcRenderer.invoke("clicker-status"),
  clickerSave: (opts) => ipcRenderer.invoke("clicker-save", opts),
  runConsole: (text) => ipcRenderer.invoke("run-console", text),
  onUpdateStatus: (cb) => {
    ipcRenderer.on("update-status", (_e, data) => cb(data));
  },
  onClickerStatus: (cb) => {
    ipcRenderer.on("clicker-status", (_e, data) => cb(data));
  },
});
