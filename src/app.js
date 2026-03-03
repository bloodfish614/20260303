import { CONFIG } from "./config.js";
import { BgVideoLoop } from "./bgVideoLoop.js";
import { SheepEngine } from "./sheepEngine.js";

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d");
const tapOverlay = document.getElementById("tap-to-start");

const bg = new BgVideoLoop(CONFIG);
const sheep = new SheepEngine(CONFIG, canvas);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  sheep.setCanvas({ width: window.innerWidth, height: window.innerHeight });
}

resize();
window.addEventListener("resize", resize);

async function bootstrapPlayback() {
  const started = await bg.tryStart();
  tapOverlay.classList.toggle("hidden", started);
}

tapOverlay.addEventListener("click", bootstrapPlayback);
canvas.addEventListener("click", () => {
  if (bg.needsTapToStart) bootstrapPlayback();
});
bootstrapPlayback();

let last = performance.now();
function loop(nowMs) {
  const now = nowMs / 1000;
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;

  bg.update(now);
  sheep.update(dt);

  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  bg.render(ctx, w, h);
  sheep.render(ctx);

  const intro = bg.introAlpha;
  if (intro < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - intro;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
