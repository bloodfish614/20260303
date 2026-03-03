export class SheepEngine {
  constructor(config, canvas) {
    this.config = config;
    this.canvas = canvas;
    this.sheep = [];
    this.images = [];
    this.imagesReady = false;
    this.metrics = this.#buildMetrics();
    this.#initSheep();
    this.#loadFrames();
  }

  setCanvas(canvas) {
    this.canvas = canvas;
    this.metrics = this.#buildMetrics();
  }

  #buildMetrics() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const toY = (distBottom) => h - (distBottom / this.config.REF_H) * h;
    return {
      w,
      h,
      yTop: toY(this.config.yTopDist),
      yMid: toY(this.config.yMidDist),
      yBottom: h,
      maxDistBottom: this.config.yTopDist,
      wrapLeft: -this.config.wrapMargin,
      wrapRight: w + this.config.wrapMargin,
      minY: toY(this.config.yTopDist) - 18,
      maxY: h + this.config.wrapMargin,
    };
  }

  #sizeFromDistBottom(distBottom, hScale) {
    const c = this.config;
    const d = Math.max(0, Math.min(c.yTopDist, distBottom));
    let size;
    if (d >= c.yMidDist) {
      const t = (d - c.yMidDist) / (c.yTopDist - c.yMidDist);
      size = c.sizeAtMid + t * (c.sizeAtTop - c.sizeAtMid);
    } else {
      const t = d / c.yMidDist;
      size = c.sizeAtBottom + t * (c.sizeAtMid - c.sizeAtBottom);
    }
    return size * (hScale / c.REF_H);
  }

  #distBottomFromY(y) {
    return ((this.metrics.h - y) / this.metrics.h) * this.config.REF_H;
  }

  #targetVisibleRange() {
    return [this.metrics.yTop, this.metrics.yBottom];
  }

  #spawnOne(id, visibleBias) {
    const m = this.metrics;
    const [vyTop, vyBottom] = this.#targetVisibleRange();
    const visible = visibleBias;
    const x = visible
      ? Math.random() * m.w
      : Math.random() < 0.5
      ? -this.config.wrapMargin * (0.2 + Math.random())
      : m.w + this.config.wrapMargin * (0.2 + Math.random());
    const y = visible
      ? vyTop + Math.random() * (vyBottom - vyTop)
      : Math.random() < 0.65
      ? vyBottom + Math.random() * this.config.wrapMargin
      : vyTop - Math.random() * 42;

    const dist = this.#distBottomFromY(y);
    const hScale = m.h;
    const sizePx = this.#sizeFromDistBottom(dist, hScale);
    const depthRatio = sizePx / this.#sizeFromDistBottom(0, hScale);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const base = this.config.baseSpeedMin + Math.random() * (this.config.baseSpeedMax - this.config.baseSpeedMin);

    return {
      id,
      x,
      y,
      vx: dir * base * (0.45 + depthRatio * 0.75),
      vy: (Math.random() - 0.5) * 4,
      headingJitter: (Math.random() - 0.5) * 0.15,
      sizePx,
      frameIndex: Math.floor(Math.random() * this.config.sheepFrameCount),
      frameTimer: 0,
      frameRate: 5 + depthRatio * 5 + Math.random() * 1.2,
      offscreenTime: visible ? 0 : 2 + Math.random() * 2,
    };
  }

  #initSheep() {
    const total = this.config.sheepTotal;
    const visCount = this.config.targetVisible;
    for (let i = 0; i < total; i += 1) {
      this.sheep.push(this.#spawnOne(i, i < visCount));
    }
  }

  #loadFrames() {
    const loads = [];
    for (let i = 1; i <= this.config.sheepFrameCount; i += 1) {
      const img = new Image();
      img.src = `${this.config.sheepFramePrefix}${i}${this.config.sheepFrameExt}`;
      this.images.push(img);
      loads.push(
        new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        })
      );
    }

    Promise.all(loads).then((arr) => {
      this.imagesReady = arr.every(Boolean);
    });
  }

  #visibleCount() {
    const m = this.metrics;
    return this.sheep.filter((s) => s.x >= 0 && s.x <= m.w && s.y >= m.yTop && s.y <= m.h).length;
  }

  update(dt) {
    this.metrics = this.#buildMetrics();
    const m = this.metrics;
    const visibleCount = this.#visibleCount();
    const deficit = this.config.targetVisible - visibleCount;

    for (const s of this.sheep) {
      if (Math.random() < this.config.wanderTurnChancePerSec * dt) {
        s.headingJitter += (Math.random() - 0.5) * this.config.maxTurnRate;
      }
      s.headingJitter *= 0.92;

      const dist = this.#distBottomFromY(s.y);
      const sizePx = this.#sizeFromDistBottom(dist, m.h);
      s.sizePx = sizePx;
      const depthRatio = sizePx / this.#sizeFromDistBottom(0, m.h);

      const speedTarget = (this.config.baseSpeedMin + depthRatio * (this.config.baseSpeedMax - this.config.baseSpeedMin)) *
        (0.92 + ((s.id * 17) % 11) * 0.01);
      const sign = Math.sign(s.vx) || 1;
      s.vx = sign * (Math.abs(s.vx) * 0.94 + speedTarget * 0.06);
      s.vx += s.headingJitter;
      s.vy += (Math.random() - 0.5) * 1.6 * dt;
      s.vy *= 0.96;

      s.x += s.vx * dt;
      s.y += s.vy * dt;

      if (s.x < m.wrapLeft) {
        s.x = m.wrapRight;
      } else if (s.x > m.wrapRight) {
        s.x = m.wrapLeft;
      }

      if (s.y > m.maxY) {
        s.y = m.minY + Math.random() * 12;
      }
      if (s.y < m.minY - 30) {
        s.y = m.h + Math.random() * (this.config.wrapMargin * 0.6);
      }

      const inView = s.x >= 0 && s.x <= m.w && s.y >= m.yTop && s.y <= m.h;
      s.offscreenTime = inView ? 0 : s.offscreenTime + dt;

      if (deficit > 2 && !inView && s.offscreenTime > 2.2 && Math.random() < this.config.offscreenReturnBoost * dt) {
        s.x = Math.random() < 0.5 ? 0 : m.w;
        s.y = m.yTop + Math.random() * (m.h - m.yTop);
      }

      if (deficit < -2 && inView && Math.random() < 0.14 * dt) {
        s.x = s.vx > 0 ? -this.config.wrapMargin * 0.6 : m.w + this.config.wrapMargin * 0.6;
      }

      s.frameRate = 4 + depthRatio * 6 + Math.min(2, Math.abs(s.vx) / 24);
      s.frameTimer += dt;
      const frameDuration = 1 / s.frameRate;
      while (s.frameTimer >= frameDuration) {
        s.frameTimer -= frameDuration;
        s.frameIndex = (s.frameIndex + 1) % this.config.sheepFrameCount;
      }
    }
  }

  #drawPlaceholder(ctx, sheep) {
    const w = sheep.sizePx * 1.4;
    const h = sheep.sizePx;
    ctx.fillStyle = "#f7f7f2";
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.4, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2e2e2e";
    ctx.beginPath();
    ctx.arc(w * 0.34, h * 0.02, h * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-w * 0.2, h * 0.16, h * 0.08, h * 0.25);
    ctx.fillRect(-w * 0.02, h * 0.16, h * 0.08, h * 0.25);
  }

  render(ctx) {
    const sorted = [...this.sheep].sort((a, b) => a.y - b.y);
    for (const s of sorted) {
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.vx < 0) ctx.scale(-1, 1);
      if (this.imagesReady) {
        const img = this.images[s.frameIndex];
        const h = s.sizePx;
        const w = h * (img.width / img.height || 1.4);
        ctx.drawImage(img, -w * 0.5, -h, w, h);
      } else {
        this.#drawPlaceholder(ctx, s);
      }
      ctx.restore();
    }
  }
}
