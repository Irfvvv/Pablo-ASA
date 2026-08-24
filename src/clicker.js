const win32 = require("./win32");

let running = false;
let loopOn = false;
let loopGen = 0;
let poll = null;
let current = null;
let count = 0;
let nextAt = 0;
let startWasDown = false;
let panicWasDown = false;
let onStatus = null;
let capturing = false;
let ignoreLeftUntil = 0;
let onBound = null;

function emit() {
  if (onStatus) onStatus(status());
}

function stop() {
  running = false;
  loopOn = false;
  emit();
  return status();
}

function loop(gen) {
  if (!loopOn || !running || gen !== loopGen) return;
  const now = Date.now();
  if (now >= nextAt) {
    win32.clickOnce(current.button);
    count += 1;
    nextAt = now + current.intervalMs;
    if (count === 1 || count % 10 === 0) emit();
    if (current.maxClicks && count >= current.maxClicks) {
      stop();
      return;
    }
  }
  setImmediate(() => loop(gen));
}

function start(opts) {
  running = false;
  loopOn = false;
  const button = win32.CLICKS[opts.button] ? opts.button : "Izquierdo";
  const intervalMs = Math.max(1, Math.min(5000, Number(opts.intervalMs) || 100));
  const maxClicks = Math.max(0, Math.round(Number(opts.maxClicks) || 0));
  current = {
    button,
    intervalMs,
    maxClicks,
    toggle: opts.toggle || "F6",
    toggleVk: win32.toggleVkOf(opts),
  };
  count = 0;
  running = true;
  loopOn = true;
  nextAt = 0;
  loopGen += 1;
  emit();
  setImmediate(() => loop(loopGen));
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
    capturing,
    opts: current,
  };
}

function beginBind() {
  capturing = true;
  ignoreLeftUntil = Date.now() + 350;
  emit();
}

function cancelBind() {
  capturing = false;
  emit();
}

function init(emitStatus, getOpts, emitBound) {
  onStatus = emitStatus;
  onBound = emitBound;
  if (poll) return;
  poll = setInterval(() => {
    if (capturing) {
      const hit = win32.firstPressedBind(ignoreLeftUntil);
      if (hit) {
        capturing = false;
        if (onBound) onBound(hit);
        emit();
      }
      return;
    }
    const cfg = (getOpts && getOpts()) || current || {};
    const startVk = win32.toggleVkOf(cfg);
    const clickVk = (win32.CLICKS[cfg.button] || win32.CLICKS.Izquierdo).vk;
    const startDown = win32.keyDown(startVk);
    const sameBtn = running && startVk === clickVk;
    if (!sameBtn && startDown && !startWasDown) toggle(cfg);
    startWasDown = startDown;
    const panicDown = win32.keyDown(win32.VK_ESCAPE);
    if (panicDown && !panicWasDown && running && startVk !== win32.VK_ESCAPE) stop();
    panicWasDown = panicDown;
  }, 40);
}

function shutdown() {
  stop();
  capturing = false;
  if (poll) {
    clearInterval(poll);
    poll = null;
  }
}

module.exports = { start, stop, toggle, status, init, shutdown, beginBind, cancelBind };
