const win32 = require("./win32");

const NAME_MAX = 32;

function defaultMacros() {
  return {
    namerOn: true,
    refillOn: true,
    namerToggle: "F8",
    namerVk: 0x77,
    refillToggle: "F9",
    refillVk: 0x78,
    activePreset: "dinos",
    presets: {
      dinos: { id: "dinos", label: "Dinos", prefix: "Anky", suffix: "", number: 1, pad: 0 },
      turrets: { id: "turrets", label: "Torretas", prefix: "H", suffix: "", number: 1, pad: 0 },
    },
    openKey: "F",
    openFirst: true,
    transferCount: 2,
    delayMs: 180,
    closeAfter: true,
    ammoX: 0,
    ammoY: 0,
    ammoSet: false,
  };
}

function mergeMacros(raw) {
  const base = defaultMacros();
  const src = raw && typeof raw === "object" ? raw : {};
  const presets = { ...base.presets, ...(src.presets || {}) };
  for (const key of Object.keys(presets)) {
    presets[key] = { ...base.presets[key] || { id: key, label: key, prefix: "", suffix: "", number: 1, pad: 0 }, ...presets[key], id: key };
  }
  if (!presets.dinos) presets.dinos = base.presets.dinos;
  if (!presets.turrets) presets.turrets = base.presets.turrets;
  const activePreset = presets[src.activePreset] ? src.activePreset : "dinos";
  return {
    ...base,
    ...src,
    presets,
    activePreset,
    namerVk: Number(src.namerVk) || base.namerVk,
    refillVk: Number(src.refillVk) || base.refillVk,
  };
}

function formatName(preset) {
  const n = Math.max(1, Math.round(Number(preset && preset.number) || 1));
  const pad = Math.max(0, Math.min(6, Math.round(Number(preset && preset.pad) || 0)));
  const num = pad ? String(n).padStart(pad, "0") : String(n);
  const pre = String((preset && preset.prefix) || "").trim();
  const suf = String((preset && preset.suffix) || "").trim();
  return [pre, num, suf].filter(Boolean).join(" ").slice(0, NAME_MAX);
}

let opts = defaultMacros();
let capturing = "";
let ignoreLeftUntil = 0;
let busy = false;
let gen = 0;
let lastMsg = "";
let poll = null;
let namerWasDown = false;
let refillWasDown = false;
let panicWasDown = false;
let ignorePanicUntil = 0;
let onStatus = null;
let onBound = null;
let getOpts = null;
let saveOpts = null;

function emit() {
  if (onStatus) onStatus(status());
}

function currentPreset() {
  return opts.presets[opts.activePreset] || opts.presets.dinos;
}

function status() {
  const p = currentPreset();
  return {
    busy,
    capturing,
    lastMsg,
    nextName: formatName(p),
    ammoSet: Boolean(opts.ammoSet),
    ammoX: opts.ammoX || 0,
    ammoY: opts.ammoY || 0,
    opts,
  };
}

function persist(patch) {
  const incoming = patch && typeof patch === "object" ? patch : {};
  opts = mergeMacros({
    ...opts,
    ...incoming,
    presets: { ...opts.presets, ...(incoming.presets || {}) },
  });
  if (saveOpts) saveOpts(opts);
  emit();
  return opts;
}

function beginBind(which) {
  capturing = which === "refill" ? "refill" : which === "ammo" ? "ammo" : "namer";
  ignoreLeftUntil = Date.now() + 350;
  lastMsg = capturing === "ammo" ? "Pon el ratón en la munición (inventario abierto) y haz clic" : "Pulsa una tecla o un botón del ratón…";
  emit();
}

function cancelBind() {
  capturing = "";
  emit();
}

function abort() {
  gen += 1;
  busy = false;
  lastMsg = "Parado";
  emit();
}

async function runNamer() {
  if (busy) return;
  const token = ++gen;
  busy = true;
  const p = currentPreset();
  const name = formatName(p);
  lastMsg = "Nombrando: " + name;
  emit();
  try {
    win32.focusAsa();
    await win32.sleep(80);
    if (token !== gen) return;
    await win32.pasteName(name);
    if (token !== gen) return;
    const next = {
      ...p,
      number: Math.max(1, Math.round(Number(p.number) || 1)) + 1,
    };
    persist({
      presets: { ...opts.presets, [p.id]: next },
    });
    lastMsg = "Puesto: " + name + " → siguiente " + formatName(next);
  } catch (err) {
    lastMsg = err instanceof Error ? err.message : String(err);
  } finally {
    if (token === gen) busy = false;
    emit();
  }
}

async function runRefill() {
  if (busy) return;
  const token = ++gen;
  busy = true;
  lastMsg = "Refill torreta…";
  emit();
  try {
    win32.focusAsa();
    await win32.sleep(60);
    if (token !== gen) return;
    const delay = Math.max(40, Math.min(800, Number(opts.delayMs) || 180));
    if (opts.openFirst) {
      const openVk = win32.vkOfKey(opts.openKey || "F");
      if (openVk) {
        win32.pressVk(openVk, 35);
        await win32.sleep(delay);
      }
    }
    if (token !== gen) return;
    const x = Number(opts.ammoX) || 0;
    const y = Number(opts.ammoY) || 0;
    if (opts.ammoSet) {
      win32.clickAt(x, y);
      await win32.sleep(Math.max(40, Math.round(delay / 2)));
    }
    if (token !== gen) return;
    const times = Math.max(1, Math.min(12, Math.round(Number(opts.transferCount) || 2)));
    for (let i = 0; i < times; i++) {
      if (token !== gen) return;
      win32.pressVk(win32.VK_T, 25);
      await win32.sleep(Math.max(30, Math.round(delay / 3)));
    }
    if (opts.closeAfter) {
      await win32.sleep(40);
      ignorePanicUntil = Date.now() + 400;
      win32.pressVk(win32.VK_ESCAPE, 30);
    }
    lastMsg = "Refill hecho";
  } catch (err) {
    lastMsg = err instanceof Error ? err.message : String(err);
  } finally {
    if (token === gen) busy = false;
    emit();
  }
}

function syncOpts() {
  if (getOpts) opts = mergeMacros(getOpts());
}

function init(emitStatus, load, emitBoundHit, persistFn) {
  onStatus = emitStatus;
  getOpts = load;
  onBound = emitBoundHit;
  saveOpts = persistFn;
  syncOpts();
  if (poll) return;
  poll = setInterval(() => {
    syncOpts();
    if (capturing === "ammo") {
      const now = Date.now();
      if (now > ignoreLeftUntil && win32.keyDown(0x01)) {
        const pos = win32.cursorPos();
        capturing = "";
        if (pos) {
          persist({ ammoX: pos.x, ammoY: pos.y, ammoSet: true });
          lastMsg = "Slot munición: " + pos.x + ", " + pos.y;
        } else {
          lastMsg = "No pude leer el ratón";
        }
        emit();
      }
      return;
    }
    if (capturing) {
      const hit = win32.firstPressedBind(ignoreLeftUntil);
      if (hit) {
        const which = capturing;
        capturing = "";
        if (hit.vk === 0x01) {
          lastMsg = "No uses clic izquierdo para el bind";
          emit();
          return;
        }
        if (onBound) onBound(which, hit);
        lastMsg = "Bind " + (which === "refill" ? "refill" : "nombrar") + ": " + hit.name;
        emit();
      }
      return;
    }
    if (!opts.namerOn && !opts.refillOn && !busy) return;
    const namerVk = Number(opts.namerVk) || 0x77;
    const refillVk = Number(opts.refillVk) || 0x78;
    const namerDown = win32.keyDown(namerVk);
    if (opts.namerOn && namerDown && !namerWasDown && !busy) runNamer();
    namerWasDown = namerDown;
    const refillDown = win32.keyDown(refillVk);
    if (opts.refillOn && refillDown && !refillWasDown && !busy && refillVk !== namerVk) runRefill();
    refillWasDown = refillDown;
    const panicDown = win32.keyDown(win32.VK_ESCAPE);
    if (panicDown && !panicWasDown && busy && Date.now() > ignorePanicUntil) abort();
    panicWasDown = panicDown;
  }, 40);
}

function shutdown() {
  abort();
  capturing = "";
  if (poll) {
    clearInterval(poll);
    poll = null;
  }
}

module.exports = {
  defaultMacros,
  mergeMacros,
  formatName,
  init,
  shutdown,
  status,
  persist,
  beginBind,
  cancelBind,
  abort,
  runNamer,
  runRefill,
};
