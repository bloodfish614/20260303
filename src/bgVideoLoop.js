export class BgVideoLoop {
  constructor(config) {
    this.config = config;
    this.videoA = this.#createVideo();
    this.videoB = this.#createVideo();
    this.front = this.videoA;
    this.back = this.videoB;

    this.hasVideo = false;
    this.started = false;
    this.needsUserGesture = false;
    this.introStart = 0;

    this.phase = "watch"; // watch -> prep -> fade
    this.fadeAlpha = 0;
    this.fadeStartSec = 0;
    this.prepInFlight = false;
    this.backPrimed = false;

    this.readyPromise = this.#probeVideo();
  }

  #createVideo() {
    const v = document.createElement("video");
    v.src = new URL(this.config.bgVideoPath, document.baseURI).toString();
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.loop = false;
    return v;
  }

  #isDrawable(video) {
    return video.readyState >= 2 && video.videoWidth > 0;
  }

  async #waitEventOrTimeout(video, events, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => finish(false), timeoutMs);
      const handlers = events.map((evt) => {
        const fn = () => finish(true);
        video.addEventListener(evt, fn, { once: true });
        return [evt, fn];
      });
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        for (const [evt, fn] of handlers) video.removeEventListener(evt, fn);
        resolve(ok);
      };
    });
  }

  async #waitNextFrame() {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async #probeVideo() {
    this.videoA.load();
    const ok = await this.#waitEventOrTimeout(this.videoA, ["loadedmetadata", "canplay"], 2200);
    this.hasVideo = ok && Number.isFinite(this.videoA.duration) && this.videoA.duration > 0;
    if (this.hasVideo) this.videoB.load();
    return this.hasVideo;
  }

  async #primeBack() {
    try {
      this.back.pause();
      try {
        this.back.load();
      } catch (_e) {
        // ignore
      }
      await this.#waitEventOrTimeout(this.back, ["loadedmetadata", "canplay"], 1500);

      if (typeof this.back.fastSeek === "function") {
        try {
          this.back.fastSeek(0);
        } catch (_e) {
          this.back.currentTime = 0;
        }
      } else {
        this.back.currentTime = 0;
      }

      await this.#waitEventOrTimeout(this.back, ["seeked"], 500);
      await this.back.play();
      const ready = await this.#waitEventOrTimeout(this.back, ["playing", "timeupdate"], 900);
      await this.#waitNextFrame();
      return ready || (this.back.readyState >= 3 && this.back.videoWidth > 0);
    } catch (_err) {
      return false;
    }
  }

  async tryStart() {
    await this.readyPromise;
    this.introStart = performance.now() / 1000;

    if (!this.hasVideo) {
      this.started = true;
      this.needsUserGesture = false;
      return true;
    }

    try {
      this.front.currentTime = 0;
      await this.front.play();
      this.started = true;
      this.needsUserGesture = false;
      this.phase = "watch";
      this.fadeAlpha = 0;
      this.backPrimed = false;
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
    const p = (now - this.introStart) / this.config.introFadeSeconds;
    return Math.max(0, Math.min(1, p));
  }

  update(nowSec) {
    if (!this.started || !this.hasVideo) return;

    const duration = this.front.duration;
    if (!Number.isFinite(duration) || duration <= this.config.xfadeSeconds) return;

    const prepTrigger = duration - (this.config.xfadePrepSeconds + this.config.xfadeSeconds);
    const fadeTrigger = duration - this.config.xfadeSeconds;

    if (this.phase === "watch" && !this.prepInFlight && this.front.currentTime >= prepTrigger) {
      this.prepInFlight = true;
      this.backPrimed = false;
      this.phase = "prep";
      this.#primeBack().then((primed) => {
        this.prepInFlight = false;
        this.backPrimed = primed;
        if (!primed) this.phase = "watch";
      });
    }

    if (this.phase === "prep" && !this.prepInFlight && this.backPrimed && this.front.currentTime >= fadeTrigger) {
      this.phase = "fade";
      this.fadeStartSec = nowSec;
      this.fadeAlpha = 0;
    }

    if (this.phase === "fade") {
      if (!this.#isDrawable(this.back)) {
        return;
      }
      const p = (nowSec - this.fadeStartSec) / this.config.xfadeSeconds;
      this.fadeAlpha = Math.max(0, Math.min(1, p));
      if (this.fadeAlpha >= 1) this.#swapFrontBack();
    }
  }

  #swapFrontBack() {
    this.front.pause();
    try {
      this.front.currentTime = 0;
    } catch (_e) {
      // ignore
    }
    const oldFront = this.front;
    this.front = this.back;
    this.back = oldFront;
    this.phase = "watch";
    this.fadeAlpha = 0;
    this.backPrimed = false;
  }

  render(ctx, w, h) {
    if (!this.hasVideo || !this.started) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#75b7e8");
      g.addColorStop(0.45, "#97cb7c");
      g.addColorStop(1, "#4f9044");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(this.front, 0, 0, w, h);
    if (this.phase === "fade" && this.#isDrawable(this.back)) {
      ctx.globalAlpha = this.fadeAlpha;
      ctx.drawImage(this.back, 0, 0, w, h);
    }
    ctx.restore();
  }
}
