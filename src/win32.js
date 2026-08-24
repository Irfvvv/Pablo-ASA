const { spawnSync } = require("child_process");
const koffi = require("koffi");

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const KEYEVENTF_KEYUP = 0x0002;
const VK_CONTROL = 0x11;
const VK_V = 0x56;
const VK_RETURN = 0x0d;
const VK_OEM_3 = 0xc0;
const VK_ESCAPE = 0x1b;

const CLICKS = {
  Izquierdo: [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP],
  Derecho: [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP],
  Central: [MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP],
};

const HOTKEYS = { Esc: VK_ESCAPE, Insert: 0x2d };
for (let i = 1; i <= 12; i++) HOTKEYS["F" + i] = 0x6f + i;

const user32 = koffi.load("user32.dll");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function keyDown(vk) {
  return (GetAsyncKeyState(vk) & 0x8000) !== 0;
}

function clickOnce(button) {
  const pair = CLICKS[button] || CLICKS.Izquierdo;
  mouse_event(pair[0], 0, 0, 0, 0);
  mouse_event(pair[1], 0, 0, 0, 0);
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
  keybd_event(VK_CONTROL, 0, 0, 0);
  pressVk(VK_V, 40);
  keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
  await sleep(80);
  pressVk(VK_RETURN, 40);
}

module.exports = {
  CLICKS,
  HOTKEYS,
  VK_ESCAPE,
  keyDown,
  clickOnce,
  pressVk,
  focusAsa,
  sendToConsole,
  sleep,
};
