const fs = require("fs");
const path = require("path");
const { execFile, spawnSync } = require("child_process");

const ASA_PROCESSES = ["ArkAscended.exe", "ArkAscended_BE.exe", "ArkAscended_WinGDK.exe"];

const STEAM_LIBRARIES = [
  "C:\\Program Files (x86)\\Steam",
  "C:\\Program Files\\Steam",
  "D:\\SteamLibrary",
  "D:\\Steam",
  "E:\\SteamLibrary",
];

const CLEAN_EXEC = [
  "r.vsync 0",
  "t.MaxFPS 0",
  "r.ScreenPercentage 100",
  "r.Tonemapper.Sharpen 2",
  "r.VolumetricCloud 0",
  "r.VolumetricFog 0",
  "r.Fog 0",
  "r.SkyAtmosphere 1",
  "r.Water.SingleLayer 1",
  "r.Water.SingleLayer.Reflection 0",
  "r.ShadowQuality 0",
  "r.Shadow.Virtual.Enable 0",
  "r.Shadow.CSM.MaxCascades 0",
  "r.ContactShadows 0",
  "r.DistanceFieldShadowing 0",
  "r.LightShaftQuality 0",
  "r.LightShafts 0",
  "r.BloomQuality 0",
  "r.DepthOfFieldQuality 0",
  "r.MotionBlur.Amount 0",
  "r.LensFlareQuality 0",
  "r.EyeAdaptationQuality 2",
  "r.Color.Grading 1",
  "r.DynamicGlobalIlluminationMethod 1",
  "r.Lumen.DiffuseIndirect.Allow 1",
  "r.Lumen.HardwareRayTracing 0",
  "r.Lumen.Reflections.Allow 0",
  "r.Lumen.ScreenProbeGather.RadianceCache.ProbeResolution 16",
  "r.Lumen.ScreenProbeGather.ScreenTraces 0",
  "sg.GlobalIlluminationQuality 1",
  "grass.Enable 0",
  "grass.SizeScale 0",
  "grass.DensityScale 0",
  "sg.FoliageQuality 0",
  "foliage.LODDistanceScale 0.5",
  "r.foliage.WPODisableMultiplier 1",
  "grass.DisableDynamicShadows 1",
  "sg.TextureQuality 1",
  "r.Streaming.PoolSize 3000",
  "r.MipMapLODBias 0",
  "r.VT.EnableFeedback 1",
  "r.VT.PoolSizeScale 1",
  "r.Nanite.MaxPixelsPerEdge 2",
  "r.DetailMode 1",
  "r.MaxAnisotropy 8",
  "wp.Runtime.HLOD 1",
  "r.SSR.Quality 0",
  "r.LightCulling.Quality 1",
  "r.PostProcessing.DisableMaterials 0",
  "r.MaterialQualityLevel 1",
  "r.MinRoughnessOverride 0",
  "r.AOOverwriteSceneColor 0",
  "FX.MaxCPUParticlesPerEmitter 50",
  "fxAllowGPUParticles 1",
  "fx.EnableNiagaraSpriteRendering 1",
  "ark.MaxActiveDestroyedMeshGeoCollectionCount 0",
  "Slate.GlobalScrollAmount 80",
  "stat fps",
].join(" | ");

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function detectSteamRoot() {
  const possible = [...STEAM_LIBRARIES];
  try {
    const { spawnSync } = require("child_process");
    const r = spawnSync(
      "reg",
      ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"],
      { encoding: "utf8" }
    );
    const m = r.stdout && r.stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (m) possible.unshift(m[1].trim().replace(/\//g, "\\"));
  } catch {
    /* ignore */
  }
  return possible.find((p) => exists(path.join(p, "steam.exe"))) || possible[0];
}

function parseLibraryFolders(steamRoot) {
  const vdf = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
  const libs = [steamRoot];
  if (!exists(vdf)) return libs;
  const text = readText(vdf);
  for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) {
    libs.push(m[1].replace(/\\\\/g, "\\"));
  }
  return [...new Set(libs)];
}

function detectAsaPath() {
  const steam = detectSteamRoot();
  const libs = steam ? parseLibraryFolders(steam) : STEAM_LIBRARIES;
  for (const lib of libs) {
    const candidate = path.join(lib, "steamapps", "common", "ARK Survival Ascended");
    if (exists(path.join(candidate, "ShooterGame"))) return candidate;
  }
  for (const extra of [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\ARK Survival Ascended",
    "D:\\SteamLibrary\\steamapps\\common\\ARK Survival Ascended",
  ]) {
    if (exists(path.join(extra, "ShooterGame"))) return extra;
  }
  return "";
}

function configDir(asaPath) {
  return path.join(asaPath, "ShooterGame", "Saved", "Config", "Windows");
}

function binariesDir(asaPath) {
  return path.join(asaPath, "ShooterGame", "Binaries");
}

function gusPath(asaPath) {
  return path.join(configDir(asaPath), "GameUserSettings.ini");
}

function deviceProfilesPath(asaPath) {
  return path.join(configDir(asaPath), "DeviceProfiles.ini");
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupFile(file) {
  if (!exists(file)) return null;
  const bak = `${file}.bak-${stamp()}`;
  fs.copyFileSync(file, bak);
  return bak;
}

function setIniValue(text, key, value) {
  const re = new RegExp(`^${key}=[^\\r\\n]*`, "gm");
  if (re.test(text)) return text.replace(new RegExp(`^${key}=[^\\r\\n]*`, "gm"), `${key}=${value}`);
  if (/\[\/Script\/ShooterGame\.ShooterGameUserSettings\]/i.test(text)) {
    return text.replace(
      /(\[\/Script\/ShooterGame\.ShooterGameUserSettings\][^\n]*\n)/i,
      `$1${key}=${value}\n`
    );
  }
  return `${text.trim()}\n${key}=${value}\n`;
}

function getIniValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

// En ASA el Camera FOV del menú es FOVMultiplier × 100 (slider máx. 1.25 = 125;
// 1.40 = 140). ÷90 es ASE. Las calibraciones 117/120 perseguían el slider viejo.
const ASA_CAMERA_FOV_BASE = 100;

function multiplierToDegrees(mult) {
  const n = parseFloat(mult);
  if (!Number.isFinite(n) || n <= 0) return 90;
  return Math.round(n * ASA_CAMERA_FOV_BASE);
}

function degreesToMultiplier(degrees) {
  return (Number(degrees) / ASA_CAMERA_FOV_BASE).toFixed(6);
}

function readFov(asaPath) {
  const file = gusPath(asaPath);
  if (!exists(file)) return 90;
  return multiplierToDegrees(getIniValue(readText(file), "FOVMultiplier"));
}

function writeFov(asaPath, degrees) {
  const d = Number(degrees);
  if (!Number.isFinite(d) || d < 70 || d > 220) {
    throw new Error("FOV tiene que ser un número entre 70 y 220 (ej. 170)");
  }
  const file = gusPath(asaPath);
  if (!exists(file)) throw new Error("No existe GameUserSettings.ini. Abre ASA una vez.");
  backupFile(file);
  const multiplier = degreesToMultiplier(d);
  writeText(file, setIniValue(readText(file), "FOVMultiplier", multiplier));
  return { file, degrees: d, multiplier };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAsaRunning() {
  for (const name of ASA_PROCESSES) {
    const r = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${name}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const out = String(r.stdout || "").toLowerCase();
    if (out.includes(name.toLowerCase())) return true;
  }
  return false;
}

async function closeAsa(timeoutMs = 25000) {
  const wasRunning = isAsaRunning();
  if (!wasRunning) return { closed: true, wasRunning: false };
  for (const name of ASA_PROCESSES) {
    spawnSync("taskkill", ["/IM", name, "/F"], { windowsHide: true, encoding: "utf8" });
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(400);
    if (!isAsaRunning()) {
      await sleep(2000);
      return { closed: true, wasRunning: true };
    }
  }
  return { closed: !isAsaRunning(), wasRunning: true };
}

function keepFovMultiplier(asaPath, multiplier) {
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    try {
      const file = gusPath(asaPath);
      if (exists(file)) {
        const cur = getIniValue(readText(file), "FOVMultiplier");
        if (cur !== String(multiplier)) {
          writeText(file, setIniValue(readText(file), "FOVMultiplier", multiplier));
        }
      }
    } catch {
      /* el juego puede tener el archivo abierto */
    }
    if (n >= 8) clearInterval(timer);
  }, 3000);
  if (typeof timer.unref === "function") timer.unref();
}

async function applyFov(asaPath, degrees) {
  const close = await closeAsa();
  if (close.wasRunning && !close.closed) {
    throw new Error("No pude cerrar ASA. Ciérralo tú y vuelve a aplicar el FOV.");
  }
  let written;
  try {
    written = writeFov(asaPath, degrees);
  } catch (err) {
    if (close.wasRunning) launchAsa();
    throw err;
  }
  await sleep(close.wasRunning ? 8000 : 800);
  launchAsa();
  keepFovMultiplier(asaPath, written.multiplier);
  return { ...written, closedGame: close.wasRunning, relaunched: true };
}

function listInis(folder) {
  if (!folder || !exists(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((f) => f.toLowerCase().endsWith(".ini") && !f.toLowerCase().startsWith("backup_"))
    .map((f) => {
      const full = path.join(folder, f);
      const st = fs.statSync(full);
      return {
        name: f,
        path: full,
        size: `${Math.max(1, Math.round(st.size / 1024))} KB`,
        mtime: st.mtimeMs,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function applyIni(asaPath, sourceIni) {
  if (!exists(sourceIni)) throw new Error("No encuentro ese INI");
  const dest = deviceProfilesPath(asaPath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const backups = [];
  if (exists(dest)) backups.push(backupFile(dest));
  fs.copyFileSync(sourceIni, dest);
  return { dest, backups: backups.filter(Boolean) };
}

function listExecs(asaPath) {
  const dir = binariesDir(asaPath);
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\.txt$/i.test(f))
    .map((f) => {
      const full = path.join(dir, f);
      return {
        name: f,
        path: full,
        stem: String(parseInt(f, 10)),
        n: parseInt(f, 10),
        preview: readText(full).slice(0, 180).replace(/\s+/g, " "),
      };
    })
    .sort((a, b) => a.n - b.n);
}

function readExec(asaPath, filename) {
  const full = path.join(binariesDir(asaPath), filename);
  if (!exists(full)) throw new Error("No existe ese exec");
  return readText(full);
}

function writeExec(asaPath, filename, contents) {
  const full = path.join(binariesDir(asaPath), filename);
  if (exists(full)) backupFile(full);
  writeText(full, contents.trim() + "\n");
  return full;
}

function writeCleanExec(asaPath, filename = "4.txt") {
  return writeExec(asaPath, filename, CLEAN_EXEC);
}

function clearConsoleHistory(asaPath) {
  const gus = gusPath(asaPath);
  const primal = path.join(configDir(asaPath), "PrimalConsole.ini");
  const input = path.join(configDir(asaPath), "Input.ini");
  const changed = [];
  for (const file of [gus, primal, input]) {
    if (!exists(file)) continue;
    backupFile(file);
    const next = readText(file)
      .split(/\r?\n/)
      .filter((line) => !/^\s*HistoryBuffer=/i.test(line))
      .join("\n");
    writeText(file, next);
    changed.push(file);
  }
  return changed;
}

function launchAsa() {
  execFile("cmd", ["/c", "start", "", "steam://rungameid/2399830"], { detached: true, stdio: "ignore" }).unref();
  return "steam://rungameid/2399830";
}

function openFolder(folder) {
  if (!exists(folder)) throw new Error("Carpeta no encontrada");
  execFile("explorer.exe", [folder]);
}

module.exports = {
  CLEAN_EXEC,
  ASA_CAMERA_FOV_BASE,
  detectAsaPath,
  configDir,
  binariesDir,
  gusPath,
  deviceProfilesPath,
  readFov,
  writeFov,
  applyFov,
  isAsaRunning,
  closeAsa,
  readExec,
  listExecs,
  writeExec,
  writeCleanExec,
  clearConsoleHistory,
  launchAsa,
  openFolder,
  exists,
};
