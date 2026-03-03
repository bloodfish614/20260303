export class BgVideoLoop {
  constructor(config) {
    this.config = config;
    this.videoA = this.#createVideo(config.bgVideoPath);
    this.videoB = this.#createVideo(config.bgVideoPath);
    this.active = this.videoA;
    this.incoming = this.videoB;
    this.alphaIncoming = 0;
    this.isCrossfading = false;
    this.crossfadeStart = 0;
    this.hasVideo = false;
    this.needsUserGesture = false;
    this.started = false;
    this.introStart = 0;
    this.readyPromise = this.#probeVideo();
  }

  #createVideo(src) {
    const v = document.createElement("video");
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.loop = false;
    v.crossOrigin = "anonymous";
    return v;
  }

  async #probeVideo() {
    const canPlay = await new Promise((resolve) => {
      const onReady = () => {
        cleanup();
        resolve(true);
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        this.videoA.removeEventListener("loadeddata", onReady);
        this.videoA.removeEventListener("error", onError);
      };
      this.videoA.addEventListener("loadeddata", onReady, { once: true });
      this.videoA.addEventListener("error", onError, { once: true });
      this.videoA.load();
    });

    this.hasVideo = canPlay && Number.isFinite(this.videoA.duration) && this.videoA.duration > 0;
    if (this.hasVideo) {
      this.videoB.load();
    }
    return this.hasVideo;
  }

  async tryStart() {
    await this.readyPromise;
    if (!this.hasVideo) {
      this.started = true;
      this.introStart = performance.now() / 1000;
      return true;
    }

    try {
      this.active.currentTime = 0;
      await this.active.play();
      this.started = true;
      this.needsUserGesture = false;
      this.introStart = performance.now() / 1000;
      return true;
    } catch (_err) {
      this.needsUserGesture = true;
      return false;
    }
  }

  get needsTapToStart() {
    return this.needsUserGesture;
  }

  get introAlpha() {
    if (!this.started) return 0;
    const now = performance.now() / 1000;
    const t = (now - this.introStart) / this.config.introFadeSeconds;
    return Math.max(0, Math.min(1, t));
  }

  update(nowSec) {
    if (!this.started || !this.hasVideo) return;
    const duration = this.active.duration;
    if (!Number.isFinite(duration) || duration <= this.config.xfadeSeconds) return;

    const threshold = duration - this.config.xfadeSeconds;
    if (!this.isCrossfading && this.active.currentTime >= threshold) {
      this.#beginCrossfade(nowSec);
    }

    if (this.isCrossfading) {
      const p = (nowSec - this.crossfadeStart) / this.config.xfadeSeconds;
      this.alphaIncoming = Math.max(0, Math.min(1, p));
      if (this.alphaIncoming >= 1) {
        this.#finishCrossfade();
      }
    }
  }

  async #beginCrossfade(nowSec) {
    this.isCrossfading = true;
    this.crossfadeStart = nowSec;
    this.alphaIncoming = 0;
    this.incoming.currentTime = 0;
    try {
      await this.incoming.play();
    } catch (_err) {
      this.isCrossfading = false;
      this.alphaIncoming = 0;
    }
  }

  #finishCrossfade() {
    this.active.pause();
    this.active.currentTime = 0;
    const old = this.active;
    this.active = this.incoming;
    this.incoming = old;
    this.isCrossfading = false;
    this.alphaIncoming = 0;
  }

  render(ctx, w, h) {
    if (!this.hasVideo) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#6fb5e8");
      g.addColorStop(0.5, "#84c77f");
      g.addColorStop(1, "#4c8f42");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    ctx.save();
    ctx.globalAlpha = this.isCrossfading ? 1 - this.alphaIncoming : 1;
    ctx.drawImage(this.active, 0, 0, w, h);
    if (this.isCrossfading) {
      ctx.globalAlpha = this.alphaIncoming;
      ctx.drawImage(this.incoming, 0, 0, w, h);
    }
    ctx.restore();
  }
}
