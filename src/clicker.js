const { spawn } = require("child_process");

let child = null;
let running = false;
let current = null;

function stop() {
  running = false;
  if (child && child.pid) {
    try {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  }
  child = null;
}

function buildScript(opts) {
  const interval = Math.max(40, Math.min(5000, Number(opts.intervalMs) || 100));
  const jitter = Math.max(0, Math.min(400, Number(opts.jitterMs) || 0));
  const onlyAsa = opts.onlyAsa !== false;
  const isMouse = opts.type === "mouse";
  const button = Number(opts.button) || 0;
  const vk = Number(opts.vk) || 0x45;

  return `
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class PabloInput {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  public static string Title() {
    var sb = new StringBuilder(512);
    GetWindowText(GetForegroundWindow(), sb, sb.Capacity);
    return sb.ToString();
  }
}
"@
$interval = ${interval}
$jitter = ${jitter}
$onlyAsa = $${onlyAsa ? "$true" : "$false"}
$isMouse = $${isMouse ? "$true" : "$false"}
$button = ${button}
$vk = ${vk}
while ($true) {
  $title = [PabloInput]::Title().ToLower()
  $asa = $title.Contains("ark") -or $title.Contains("ascended") -or $title.Contains("shooter")
  if (-not $onlyAsa -or $asa) {
    if ($isMouse) {
      if ($button -eq 0) { [PabloInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [PabloInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }
      elseif ($button -eq 1) { [PabloInput]::mouse_event(32,0,0,0,[UIntPtr]::Zero); [PabloInput]::mouse_event(64,0,0,0,[UIntPtr]::Zero) }
      elseif ($button -eq 2) { [PabloInput]::mouse_event(8,0,0,0,[UIntPtr]::Zero); [PabloInput]::mouse_event(16,0,0,0,[UIntPtr]::Zero) }
      elseif ($button -eq 4) { [PabloInput]::mouse_event(128,0,0,2,[UIntPtr]::Zero); [PabloInput]::mouse_event(256,0,0,2,[UIntPtr]::Zero) }
      else { [PabloInput]::mouse_event(128,0,0,1,[UIntPtr]::Zero); [PabloInput]::mouse_event(256,0,0,1,[UIntPtr]::Zero) }
    } else {
      [PabloInput]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero)
      [PabloInput]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero)
    }
  }
  $wait = $interval
  if ($jitter -gt 0) { $wait = $wait + (Get-Random -Minimum 0 -Maximum ($jitter + 1)) }
  Start-Sleep -Milliseconds $wait
}
`.trim();
}

function start(opts) {
  stop();
  const intervalMs = Math.max(40, Math.min(5000, Number(opts.intervalMs) || 100));
  const jitterMs = Math.max(0, Math.min(400, Number(opts.jitterMs) || 0));
  const onlyAsa = opts.onlyAsa !== false;
  if (opts.type === "key" && !opts.vk) throw new Error("Elige una tecla");
  current = { ...opts, intervalMs, jitterMs, onlyAsa };
  running = true;
  child = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", buildScript(current)], {
    windowsHide: true,
    stdio: "ignore",
  });
  child.on("exit", () => {
    running = false;
    child = null;
  });
  return status();
}

function status() {
  return { running: Boolean(running && child), opts: current };
}

module.exports = { start, stop, status };
