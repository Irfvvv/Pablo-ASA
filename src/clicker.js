const win32 = require("./win32");

let running = false;
let timer = null;
let poll = null;
let current = null;
let count = 0;
let startWasDown = false;
let panicWasDown = false;
let onStatus = null;

function emit() {
  if (onStatus) onStatus(status());
}

function stop() {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  emit();
  return status();
}

function tick() {
  if (!running) return;
  win32.clickOnce(current.button);
  count += 1;
  if (count === 1 || count % 8 === 0) emit();
  if (current.maxClicks && count >= current.maxClicks) {
    stop();
    return;
  }
  timer = setTimeout(tick, current.intervalMs);
}

function start(opts) {
  stop();
  const button = win32.CLICKS[opts.button] ? opts.button : "Izquierdo";
  const intervalMs = Math.max(1, Math.min(5000, Number(opts.intervalMs) || 100));
  const maxClicks = Math.max(0, Math.round(Number(opts.maxClicks) || 0));
  current = {
    button,
    intervalMs,
    maxClicks,
    toggle: opts.toggle || "F6",
  };
  count = 0;
  running = true;
  emit();
  timer = setTimeout(tick, 0);
  return status();
}

function toggle(opts) {
  if (running) return stop();
  return start(opts || current || {});
}

function status() {
  return {
    running,
    count,
    opts: current,
  };
}

function init(emitStatus, getOpts) {
  onStatus = emitStatus;
  if (poll) return;
  poll = setInterval(() => {
    const cfg = (getOpts && getOpts()) || current || {};
    const startVk = win32.HOTKEYS[cfg.toggle || "F6"] || win32.HOTKEYS.F6;
    const startDown = win32.keyDown(startVk);
    if (startDown && !startWasDown) toggle(cfg);
    startWasDown = startDown;
    const panicDown = win32.keyDown(win32.VK_ESCAPE);
    if (panicDown && !panicWasDown && running) stop();
    panicWasDown = panicDown;
  }, 40);
}

function shutdown() {
  stop();
  if (poll) {
    clearInterval(poll);
    poll = null;
  }
}

module.exports = { start, stop, toggle, status, init, shutdown };
