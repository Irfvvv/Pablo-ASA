const { spawnSync } = require("child_process");
const koffi = require("koffi");

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_XDOWN = 0x0080;
const MOUSEEVENTF_XUP = 0x0100;
const XBUTTON1 = 0x0001;
const XBUTTON2 = 0x0002;
const KEYEVENTF_KEYUP = 0x0002;
const VK_LBUTTON = 0x01;
const VK_RBUTTON = 0x02;
const VK_MBUTTON = 0x04;
const VK_XBUTTON1 = 0x05;
const VK_XBUTTON2 = 0x06;
const VK_CONTROL = 0x11;
const VK_A = 0x41;
const VK_V = 0x56;
const VK_T = 0x54;
const VK_RETURN = 0x0d;
const VK_OEM_3 = 0xc0;
const VK_ESCAPE = 0x1b;

const CLICKS = {
  Izquierdo: { down: MOUSEEVENTF_LEFTDOWN, up: MOUSEEVENTF_LEFTUP, data: 0, vk: VK_LBUTTON },
  Derecho: { down: MOUSEEVENTF_RIGHTDOWN, up: MOUSEEVENTF_RIGHTUP, data: 0, vk: VK_RBUTTON },
  Central: { down: MOUSEEVENTF_MIDDLEDOWN, up: MOUSEEVENTF_MIDDLEUP, data: 0, vk: VK_MBUTTON },
  Atrás: { down: MOUSEEVENTF_XDOWN, up: MOUSEEVENTF_XUP, data: XBUTTON1, vk: VK_XBUTTON1 },
  Adelante: { down: MOUSEEVENTF_XDOWN, up: MOUSEEVENTF_XUP, data: XBUTTON2, vk: VK_XBUTTON2 },
};

const HOTKEYS = {
  Esc: VK_ESCAPE,
  Insert: 0x2d,
  Espacio: 0x20,
  Tab: 0x09,
  "Clic izquierdo": VK_LBUTTON,
  "Clic derecho": VK_RBUTTON,
  "Clic rueda": VK_MBUTTON,
  "Ratón atrás": VK_XBUTTON1,
  "Ratón adelante": VK_XBUTTON2,
};
for (let i = 1; i <= 12; i++) HOTKEYS["F" + i] = 0x6f + i;
for (let i = 0; i < 26; i++) HOTKEYS[String.fromCharCode(65 + i)] = 0x41 + i;
for (let i = 0; i < 10; i++) HOTKEYS[String(i)] = 0x30 + i;

const BIND_LIST = Object.entries(HOTKEYS).filter(([name]) => name !== "Esc");

const MouseInput = koffi.struct("MouseInput", {
  dx: "int32",
  dy: "int32",
  mouseData: "uint32",
  dwFlags: "uint32",
  time: "uint32",
  dwExtraInfo: "uintptr",
});
const Input = koffi.struct("Input", {
  type: "uint32",
  dummy: "uint32",
  mi: MouseInput,
});

const Point = koffi.struct("Point", {
  x: "int32",
  y: "int32",
});

const user32 = koffi.load("user32.dll");
const GetCursorPos = user32.func("__stdcall", "GetCursorPos", "int32", [koffi.out(koffi.pointer(Point))]);
const SetCursorPos = user32.func("__stdcall", "SetCursorPos", "int32", ["int32", "int32"]);
const mouse_event = user32.func("__stdcall", "mouse_event", "void", [
  "uint32",
  "int32",
  "int32",
  "uint32",
  "uintptr",
]);
const keybd_event = user32.func("__stdcall", "keybd_event", "void", [
  "uint8",
  "uint8",
  "uint32",
  "uintptr",
]);
const GetAsyncKeyState = user32.func("__stdcall", "GetAsyncKeyState", "int16", ["int32"]);
const MapVirtualKeyW = user32.func("__stdcall", "MapVirtualKeyW", "uint32", ["uint32", "uint32"]);
const SendInput = user32.func("__stdcall", "SendInput", "uint32", ["uint32", koffi.pointer(Input), "int32"]);
const INPUT_SIZE = koffi.sizeof(Input);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyDown(vk) {
  return (GetAsyncKeyState(vk) & 0x8000) !== 0;
}

function sendMouse(flags, data) {
  const rec = {
    type: 0,
    dummy: 0,
    mi: { dx: 0, dy: 0, mouseData: data || 0, dwFlags: flags, time: 0, dwExtraInfo: 0 },
  };
  const n = SendInput(1, rec, INPUT_SIZE);
  if (!n) mouse_event(flags, 0, 0, data || 0, 0);
}

function clickOnce(button) {
  const spec = CLICKS[button] || CLICKS.Izquierdo;
  sendMouse(spec.down, spec.data);
  const hold = Date.now() + 2;
  while (Date.now() < hold) {
    /* hold */
  }
  sendMouse(spec.up, spec.data);
}

function toggleVkOf(cfg) {
  const n = Number(cfg && cfg.toggleVk);
  if (Number.isFinite(n) && n > 0) return n;
  return HOTKEYS[(cfg && cfg.toggle) || "F6"] || HOTKEYS.F6;
}

function firstPressedBind(ignoreLeftUntil) {
  const now = Date.now();
  for (const [name, vk] of BIND_LIST) {
    if (vk === VK_LBUTTON && now < ignoreLeftUntil) continue;
    if (keyDown(vk)) return { name, vk };
  }
  return null;
}

function pressVk(vk, holdMs = 30) {
  const scan = MapVirtualKeyW(vk, 0);
  keybd_event(vk, scan, 0, 0);
  const end = Date.now() + holdMs;
  while (Date.now() < end) {
    /* hold */
  }
  keybd_event(vk, scan, KEYEVENTF_KEYUP, 0);
}

function focusAsa() {
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      "$p = Get-Process ArkAscended,ArkAscended_WinGDK -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; if (-not $p) { exit 2 }; $w = New-Object -ComObject WScript.Shell; if ($w.AppActivate($p.Id)) { exit 0 } else { exit 3 }",
    ],
    { windowsHide: true, encoding: "utf8" }
  );
  return r.status === 0;
}

function chordCtrl(vk, holdMs = 25) {
  const ctrlScan = MapVirtualKeyW(VK_CONTROL, 0);
  keybd_event(VK_CONTROL, ctrlScan, 0, 0);
  pressVk(vk, holdMs);
  keybd_event(VK_CONTROL, ctrlScan, KEYEVENTF_KEYUP, 0);
}

function cursorPos() {
  const pt = { x: 0, y: 0 };
  if (!GetCursorPos(pt)) return null;
  return { x: pt.x, y: pt.y };
}

function moveCursor(x, y) {
  SetCursorPos(Math.round(x), Math.round(y));
}

function clickAt(x, y, button = "Izquierdo") {
  moveCursor(x, y);
  const hold = Date.now() + 8;
  while (Date.now() < hold) {
    /* settle */
  }
  clickOnce(button);
}

function vkOfKey(name) {
  const raw = String(name || "").trim();
  if (!raw || raw === "Ninguna" || raw === "None") return 0;
  if (HOTKEYS[raw]) return HOTKEYS[raw];
  const up = raw.toUpperCase();
  if (HOTKEYS[up]) return HOTKEYS[up];
  return 0;
}

async function pasteName(text) {
  const payload = String(text || "").slice(0, 32);
  if (!payload) throw new Error("Nombre vacío");
  const { clipboard } = require("electron");
  clipboard.writeText(payload);
  await sleep(40);
  chordCtrl(VK_A, 25);
  await sleep(25);
  chordCtrl(VK_V, 25);
  await sleep(40);
  pressVk(VK_RETURN, 30);
}

async function sendToConsole(text) {
  const payload = String(text || "").trim();
  if (!payload) throw new Error("No hay comandos que enviar");
  const { clipboard } = require("electron");
  clipboard.writeText(payload);
  await sleep(500);
  if (!focusAsa()) throw new Error("No encuentro ASA abierto. Ábrelo y ponlo delante.");
  await sleep(120);
  pressVk(VK_OEM_3, 40);
  await sleep(160);
  chordCtrl(VK_V, 40);
  await sleep(80);
  pressVk(VK_RETURN, 40);
}

module.exports = {
  CLICKS,
  HOTKEYS,
  VK_ESCAPE,
  VK_T,
  keyDown,
  clickOnce,
  clickAt,
  cursorPos,
  moveCursor,
  toggleVkOf,
  firstPressedBind,
  pressVk,
  vkOfKey,
  focusAsa,
  pasteName,
  sendToConsole,
  sleep,
};
