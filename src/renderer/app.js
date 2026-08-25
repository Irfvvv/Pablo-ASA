const $ = (id) => document.getElementById(id);
let state = null;
let selectedExec = null;

function toast(msg, ok = true) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  el.style.borderColor = ok ? "#3ecf8e" : "#ef6b6b";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.style.display = "none";
  }, 3200);
}

function showTab(id) {
  document.querySelectorAll("main > section").forEach((s) => s.classList.add("hidden"));
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  $("tab-" + id).classList.remove("hidden");
}

document.querySelectorAll(".nav button").forEach((b) => {
  b.addEventListener("click", () => showTab(b.dataset.tab));
});

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fovHint(raw) {
  const d = Math.round(Number(raw));
  if (!Number.isFinite(d) || d < 70 || d > 220) {
    $("fovHint").textContent = "Pon un número entre 70 y 220. Ejemplo: 170";
    return;
  }
  $("fovHint").textContent = "Camera FOV del menú: " + d;
}

async function saveFov() {
  toast("Cerrando ASA, guardando FOV y abriendo Steam…");
  const r = await window.pablo.setFov(Number($("fovInput").value));
  if (r?.ok) {
    const extra = r.closedGame ? "ASA se cerró y se está abriendo otra vez." : "ASA se está abriendo por Steam.";
    toast("Camera FOV " + r.degrees + " guardado. " + extra);
    await refresh();
  } else {
    toast(r?.error || "No se pudo guardar el FOV", false);
  }
}

function renderExecs() {
  const box = $("execList");
  box.innerHTML = "";
  const files = state?.execs || [];
  if (!files.length) {
    box.innerHTML = '<div class="item">No hay execs en Binaries. Escribe el clean (exec 4) desde Inicio.</div>';
    return;
  }
  files.forEach((f) => {
    const div = document.createElement("div");
    div.className = "item" + (selectedExec === f.name ? " sel" : "");
    div.innerHTML = `<span>exec ${esc(f.stem)}</span><span class="mono">${esc(f.name)}</span>`;
    div.addEventListener("click", async () => {
      selectedExec = f.name;
      $("execTitle").textContent = "Editar exec " + f.stem;
      const r = await window.pablo.readExec(f.name);
      $("execBody").value = r?.ok ? r.content : "";
      renderExecs();
    });
    box.appendChild(div);
  });
}

function fillGroups() {
  const sel = $("cmdGroup");
  if (sel.dataset.ready) return;
  sel.innerHTML = '<option value="">Todos</option>';
  (state.commandGroups || []).forEach((g) => {
    const o = document.createElement("option");
    o.value = g.id;
    o.textContent = g.name;
    sel.appendChild(o);
  });
  sel.dataset.ready = "1";
}

function renderCommands() {
  const q = ($("cmdSearch").value || "").toLowerCase();
  const group = $("cmdGroup").value;
  const box = $("cmdList");
  box.innerHTML = "";
  const items = (state.commands || []).filter((c) => {
    if (group && c.group !== group) return false;
    if (!q) return true;
    return (c.name + " " + c.off + " " + c.on + " " + c.quita + " " + c.pone).toLowerCase().includes(q);
  });
  if (!items.length) {
    box.innerHTML = '<div class="cmd"><p>Nada con esa búsqueda.</p></div>';
    return;
  }
  items.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "cmd";
    const toggle = c.toggle ? '<span class="pill">toggle</span> ' : "";
    div.innerHTML = `
      <h3>${toggle}${esc(c.name)}</h3>
      <p><span class="tag-off">Quita</span> ${esc(c.quita)}</p>
      <p><span class="tag-on">Pone</span> ${esc(c.pone)}</p>
      <p class="mono">${esc(c.off)}${c.on && c.on !== c.off ? "  |  " + esc(c.on) : ""}</p>
      <div class="vals">
        <button class="btn" data-add-off="${i}">Quitar (FPS)</button>
        ${c.toggle || !c.on || c.on === c.off ? "" : '<button class="btn secondary" data-add-on="' + i + '">Poner</button>'}
        <button class="btn secondary" data-copy="${i}-off">${c.toggle ? "Copiar" : "Copiar off"}</button>
        ${c.toggle || c.on === c.off ? "" : '<button class="btn secondary" data-copy="' + i + '-on">Copiar on</button>'}
      </div>
    `;
    div.querySelectorAll("button[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const which = btn.dataset.copy.endsWith("-on") ? c.on : c.off;
        await window.pablo.copyText(which);
        toast("Copiado");
      });
    });
    div.querySelectorAll("button[data-add-off]").forEach((btn) => {
      btn.addEventListener("click", () => addToQueue(c.off, c.name + " (quitar / más FPS)"));
    });
    div.querySelectorAll("button[data-add-on]").forEach((btn) => {
      btn.addEventListener("click", () => addToQueue(c.on, c.name + " (poner)"));
    });
    box.appendChild(div);
  });
}

function paint() {
  if (!state) return;
  $("ver").textContent = "v" + (state.version || "—");
  $("asaPath").value = state.config?.asaPath || "";
  const ok = state.asaOk;
  $("asaStatus").innerHTML = ok
    ? `<span class="ok">Encontrado</span><div class="mono">${esc(state.config.asaPath)}</div>`
    : `<span class="bad">Ruta no válida</span><div class="mono">${esc(state.config?.asaPath || "—")}</div>`;
  if (!state.packaged) {
    $("updStatus").textContent =
      "Estás en npm start. El auto-update es el acceso directo Pablo ASA (el Setup de una vez).";
  }
  $("fovInput").value = String(state.fov ?? 120);
  fovHint($("fovInput").value);
  renderExecs();
  fillGroups();
  renderCommands();
  applyClickerUi();
  applyMacrosUi();
  if ($("cmdQueue") && !$("cmdQueue").dataset.loaded) {
    $("cmdQueue").value = state.config?.cmdQueue || "";
    $("cmdQueue").dataset.loaded = "1";
  }
  if (!state.config?.setupDone) showTab("setup");
}

async function refresh() {
  state = await window.pablo.getState();
  paint();
}

$("fovInput").addEventListener("input", () => fovHint($("fovInput").value));
$("fovInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveFov();
});
$("btnFov").addEventListener("click", saveFov);

$("cmdSearch").addEventListener("input", renderCommands);
$("cmdGroup").addEventListener("change", renderCommands);

$("btnLaunch").addEventListener("click", async () => {
  const r = await window.pablo.launchAsa();
  toast(r?.ok ? "Lanzando ASA…" : r?.error || "No se pudo abrir", r?.ok);
});
$("btnDetect").addEventListener("click", async () => {
  const r = await window.pablo.detectAsa();
  toast(r?.ok ? "Ruta detectada" : r?.error || "No encontré ASA", r?.ok);
  await refresh();
});
$("btnDetect2").addEventListener("click", () => $("btnDetect").click());
$("btnClean").addEventListener("click", async () => {
  const r = await window.pablo.writeCleanExec();
  toast(r?.ok ? "Escrito exec 4. En consola: exec 4" : r?.error || "Error", r?.ok);
  await refresh();
});
$("btnOpenBin").addEventListener("click", () => window.pablo.openFolder("binaries"));
$("btnSaveExec").addEventListener("click", async () => {
  if (!selectedExec) return toast("Elige un exec", false);
  const r = await window.pablo.writeExec(selectedExec, $("execBody").value);
  toast(r?.ok ? "Exec guardado" : r?.error || "Error", r?.ok);
  await refresh();
});
$("btnCopyExec").addEventListener("click", async () => {
  await window.pablo.copyText($("execBody").value || "");
  toast("Copiado");
});
$("btnClearHist").addEventListener("click", async () => {
  const r = await window.pablo.clearConsole();
  toast(r?.ok ? "Historial borrado" : r?.error || "Error", r?.ok);
});
$("btnCfg").addEventListener("click", () => window.pablo.openFolder("config"));
$("btnAsaDir").addEventListener("click", () => window.pablo.openFolder("asa"));
$("btnPickAsa").addEventListener("click", async () => {
  const p = await window.pablo.pickFolder();
  if (p) $("asaPath").value = p;
});
$("btnSaveSetup").addEventListener("click", async () => {
  const r = await window.pablo.saveConfig({
    asaPath: $("asaPath").value.trim(),
    setupDone: true,
  });
  toast(r?.ok ? "Setup guardado" : r?.error || "Error", r?.ok);
  await refresh();
  showTab("home");
});
$("btnUpdate").addEventListener("click", async () => {
  const r = await window.pablo.checkUpdates();
  if (!r?.ok) toast(r?.error || "No se pudo buscar", false);
  else toast(r.message || ("GitHub: v" + (r.version || "—")));
});

window.pablo.onUpdateStatus((s) => {
  const map = {
    checking: "Buscando actualización…",
    available: "Hay v" + (s.version || "") + " — descargando e instalando sola",
    current: s.message || "Estás al día",
    downloading: "Descargando " + Math.round(s.percent || 0) + "%",
    ready: "Instalando v" + (s.version || "") + "…",
    error: s.message || "Error de update",
  };
  const msg = map[s?.state] || s?.message || "—";
  $("updateLabel").textContent = "Update: " + (s?.state || "—");
  $("updStatus").textContent = msg;
});

function applyClickerUi() {
  const c = state?.config?.clicker;
  if (c) {
    $("clickerInterval").value = String(c.intervalMs ?? 100);
    $("clickerButton").value = c.button || "Izquierdo";
    $("clickerMax").value = String(c.maxClicks ?? 0);
    clickerBind.toggle = c.toggle || "F6";
    clickerBind.toggleVk = c.toggleVk || 0x75;
    $("clickerBindLabel").textContent = clickerBind.toggle;
  }
  const st = state?.clicker;
  $("clickerRun").textContent = st?.running ? "Clicando… " + (st.count || 0) : "Parado";
  $("clickerRun").style.color = st?.running ? "var(--ok)" : "";
  $("clickerFg").textContent = st?.capturing
    ? "Pulsa una tecla o un botón del ratón…"
    : st?.running
      ? "Clics: " + (st.count || 0)
      : clickerBind.toggle + " inicia/para · Esc para";
}

const clickerBind = { toggle: "F6", toggleVk: 0x75 };

function clickerOpts() {
  return {
    button: $("clickerButton").value,
    intervalMs: Number($("clickerInterval").value),
    maxClicks: Number($("clickerMax").value),
    toggle: clickerBind.toggle,
    toggleVk: clickerBind.toggleVk,
  };
}

async function saveClickerSettings() {
  await window.pablo.clickerSave(clickerOpts());
}

function addToQueue(cmd, label) {
  const line = String(cmd || "").trim();
  if (!line) return toast("Ese no tiene comando", false);
  const box = $("cmdQueue");
  const prev = (box.value || "").trim();
  box.value = prev ? prev + " | " + line : line;
  saveCmdQueue();
  toast("Añadido: " + label);
}

async function saveCmdQueue() {
  try {
    await window.pablo.saveConfig({ cmdQueue: $("cmdQueue").value || "" });
  } catch {
    /* ignore */
  }
}

$("btnRunCmds").addEventListener("click", async () => {
  const text = ($("cmdQueue").value || "").trim();
  if (!text) return toast("Añade un Quitar (FPS) o un Poner primero", false);
  toast("En 0,5 s se pega en la consola de ASA… mira el juego");
  const r = await window.pablo.runConsole(text);
  toast(r?.ok ? "Enviado a consola" : r?.error || "Error", r?.ok);
});
$("btnClearQueue").addEventListener("click", () => {
  $("cmdQueue").value = "";
  saveCmdQueue();
});
$("cmdQueue").addEventListener("change", saveCmdQueue);

$("btnClickerStart").addEventListener("click", async () => {
  const r = await window.pablo.clickerStart(clickerOpts());
  toast(r?.ok ? "Clicando — " + clickerBind.toggle + " para parar, Esc emergencia" : r?.error || "Error", r?.ok);
});
$("btnClickerStop").addEventListener("click", async () => {
  await window.pablo.clickerStop();
  toast("Parado");
});
$("btnClickerBind").addEventListener("click", async () => {
  await window.pablo.clickerBind();
  $("clickerFg").textContent = "Pulsa una tecla o un botón del ratón…";
  toast("Pulsa tecla o botón del ratón");
});
["clickerInterval", "clickerButton", "clickerMax"].forEach((id) => {
  $(id).addEventListener("change", saveClickerSettings);
});

window.pablo.onClickerBound((cfg) => {
  clickerBind.toggle = cfg.toggle;
  clickerBind.toggleVk = cfg.toggleVk;
  $("clickerBindLabel").textContent = cfg.toggle;
  toast("Bind: " + cfg.toggle);
});

window.pablo.onClickerStatus((st) => {
  $("clickerRun").textContent = st?.running ? "Clicando… " + (st.count || 0) : "Parado";
  $("clickerRun").style.color = st?.running ? "var(--ok)" : "";
  $("clickerFg").textContent = st?.capturing
    ? "Pulsa una tecla o un botón del ratón…"
    : st?.running
      ? "Clics: " + (st.count || 0)
      : clickerBind.toggle + " inicia/para · Esc para";
});

let macrosActive = "dinos";

function currentMacroPreset(cfg) {
  const macrosCfg = cfg || state?.config?.macros;
  const id = macrosActive || macrosCfg?.activePreset || "dinos";
  return macrosCfg?.presets?.[id] || { prefix: "", suffix: "", number: 1, pad: 0 };
}

function macroPreviewText(p) {
  const n = Math.max(1, Math.round(Number(p.number) || 1));
  const pad = Math.max(0, Math.round(Number(p.pad) || 0));
  const num = pad ? String(n).padStart(pad, "0") : String(n);
  return [String(p.prefix || "").trim(), num, String(p.suffix || "").trim()].filter(Boolean).join(" ");
}

function applyMacrosUi() {
  const m = state?.config?.macros;
  if (!m) return;
  macrosActive = m.activePreset || macrosActive || "dinos";
  $("macroNamerOn").checked = m.namerOn !== false;
  $("macroRefillOn").checked = m.refillOn !== false;
  $("macroNamerBind").textContent = m.namerToggle || "F8";
  $("macroRefillBind").textContent = m.refillToggle || "F9";
  $("macroOpenKey").value = m.openKey || "F";
  $("macroOpenFirst").checked = m.openFirst !== false;
  $("macroTransfers").value = String(m.transferCount ?? 2);
  $("macroDelay").value = String(m.delayMs ?? 180);
  $("macroCloseAfter").checked = m.closeAfter !== false;
  document.querySelectorAll(".preset-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.preset === macrosActive);
  });
  const p = currentMacroPreset(m);
  $("macroPrefix").value = p.prefix || "";
  $("macroNumber").value = String(p.number ?? 1);
  $("macroPad").value = String(p.pad ?? 0);
  $("macroSuffix").value = p.suffix || "";
  $("macroNext").textContent = "Siguiente: " + macroPreviewText(p);
  const ammo = m.ammoSet ? m.ammoX + ", " + m.ammoY : "no grabado";
  $("macroAmmo").textContent = "Slot munición: " + ammo;
  const st = state?.macros;
  if (st?.capturing) $("macroMsg").textContent = st.lastMsg || "Pulsa…";
  else if (st?.lastMsg) $("macroMsg").textContent = st.lastMsg;
}

function macrosPatchFromUi() {
  const p = {
    prefix: $("macroPrefix").value,
    suffix: $("macroSuffix").value,
    number: Number($("macroNumber").value) || 1,
    pad: Number($("macroPad").value) || 0,
  };
  $("macroNext").textContent = "Siguiente: " + macroPreviewText(p);
  return {
    namerOn: $("macroNamerOn").checked,
    refillOn: $("macroRefillOn").checked,
    activePreset: macrosActive,
    openKey: $("macroOpenKey").value,
    openFirst: $("macroOpenFirst").checked,
    transferCount: Number($("macroTransfers").value) || 2,
    delayMs: Number($("macroDelay").value) || 180,
    closeAfter: $("macroCloseAfter").checked,
    presets: {
      [macrosActive]: p,
    },
  };
}

async function saveMacrosSettings() {
  await window.pablo.macrosSave(macrosPatchFromUi());
}

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    await saveMacrosSettings();
    macrosActive = btn.dataset.preset;
    await window.pablo.macrosSave({ activePreset: macrosActive });
    state = await window.pablo.getState();
    applyMacrosUi();
  });
});

[
  "macroNamerOn",
  "macroRefillOn",
  "macroPrefix",
  "macroNumber",
  "macroPad",
  "macroSuffix",
  "macroOpenKey",
  "macroOpenFirst",
  "macroTransfers",
  "macroDelay",
  "macroCloseAfter",
].forEach((id) => {
  $(id).addEventListener("change", saveMacrosSettings);
  if ($(id).tagName === "INPUT" && $(id).type !== "checkbox") {
    $(id).addEventListener("input", () => {
      const p = {
        prefix: $("macroPrefix").value,
        suffix: $("macroSuffix").value,
        number: Number($("macroNumber").value) || 1,
        pad: Number($("macroPad").value) || 0,
      };
      $("macroNext").textContent = "Siguiente: " + macroPreviewText(p);
    });
  }
});

$("btnMacroNamerBind").addEventListener("click", async () => {
  await window.pablo.macrosBind("namer");
  $("macroMsg").textContent = "Pulsa tecla o botón del ratón para nombrar…";
  toast("Bind nombrar: pulsa tecla o ratón");
});
$("btnMacroRefillBind").addEventListener("click", async () => {
  await window.pablo.macrosBind("refill");
  $("macroMsg").textContent = "Pulsa tecla o botón del ratón para refill…";
  toast("Bind refill: pulsa tecla o ratón");
});
$("btnMacroAmmo").addEventListener("click", async () => {
  await window.pablo.macrosAmmo();
  $("macroMsg").textContent = "En el juego, clic en la munición del inventario";
  toast("Abre una torreta y haz clic en los bullets");
});
$("btnMacroReset").addEventListener("click", async () => {
  await window.pablo.macrosReset(macrosActive);
  state = await window.pablo.getState();
  applyMacrosUi();
  toast("Número a 1");
});

window.pablo.onMacrosBound((cfg) => {
  if (cfg.namerToggle) $("macroNamerBind").textContent = cfg.namerToggle;
  if (cfg.refillToggle) $("macroRefillBind").textContent = cfg.refillToggle;
  toast("Bind guardado");
});

window.pablo.onMacrosStatus((st) => {
  if (!st) return;
  if (state) {
    state.macros = st;
    if (st.opts) {
      if (!state.config) state.config = {};
      state.config.macros = st.opts;
      const p = st.opts.presets?.[macrosActive] || st.opts.presets?.[st.opts.activePreset];
      if (p && document.activeElement !== $("macroNumber") && document.activeElement !== $("macroPrefix")) {
        $("macroNumber").value = String(p.number ?? 1);
        $("macroNext").textContent = "Siguiente: " + (st.nextName || macroPreviewText(p));
      }
    }
  }
  if (st.ammoSet) $("macroAmmo").textContent = "Slot munición: " + st.ammoX + ", " + st.ammoY;
  $("macroMsg").textContent = st.lastMsg || "";
});

refresh().catch((e) => toast(String(e), false));
