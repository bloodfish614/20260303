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
      wrapLeft: -this.config.wrapMargin,
      wrapRight: w + this.config.wrapMargin,
      minYSoft: toY(this.config.yTopDist),
      maxYSoft: h,
      minYHard: toY(this.config.yTopDist) - 32,
      maxYHard: h + this.config.wrapMargin,
    };
  }

  #distBottomFromY(y) {
    return ((this.metrics.h - y) / this.metrics.h) * this.config.REF_H;
  }

  #piecewiseMul(distBottom, topMul, midMul, bottomMul) {
    const c = this.config;
    const d = Math.max(0, Math.min(c.yTopDist, distBottom));
    if (d >= c.yMidDist) {
      const t = (d - c.yMidDist) / (c.yTopDist - c.yMidDist);
      return midMul + t * (topMul - midMul);
    }
    const t = d / c.yMidDist;
    return bottomMul + t * (midMul - bottomMul);
  }

  #depthSizeMul(distBottom) {
    const c = this.config;
    return this.#piecewiseMul(distBottom, c.depthSizeMulTop, c.depthSizeMulMid, c.depthSizeMulBottom);
  }

  #depthSpeedMul(distBottom) {
    const c = this.config;
    return this.#piecewiseMul(distBottom, c.depthSpeedMulTop, c.depthSpeedMulMid, c.depthSpeedMulBottom);
  }

  #baseSizeAtDist(distBottom, hScale) {
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

  #depthRatioByY(y) {
    const baseBottom = this.#baseSizeAtDist(0, this.metrics.h);
    const base = this.#baseSizeAtDist(this.#distBottomFromY(y), this.metrics.h);
    return base / baseBottom;
  }

  #sampleLayeredVisibleY(slot, count) {
    const { yTop, yBottom } = this.metrics;
    const bands = Math.max(5, Math.min(8, count));
    const band = slot % bands;
    const bandH = (yBottom - yTop) / bands;
    const jitter = (Math.random() - 0.5) * bandH * 0.6;
    return yTop + band * bandH + bandH * 0.5 + jitter;
  }

  #makeSheep(id, x, y, visible) {
    const depthRatio = this.#depthRatioByY(y);
    const distBottom = this.#distBottomFromY(y);
    const depthSpeedMul = this.#depthSpeedMul(distBottom);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const indivSpeedMul = 0.72 + Math.random() * 0.62;
    const speedCurve = Math.pow(Math.max(0.05, depthRatio), 1.6);
    const speed0 = this.config.baseSpeedMin + speedCurve * (this.config.baseSpeedMax - this.config.baseSpeedMin);
    return {
      id,
      x,
      y,
      vx: dir * speed0 * depthSpeedMul * indivSpeedMul,
      yVel: (Math.random() - 0.5) * 0.8,
      yDrift: Math.random() * Math.PI * 2,
      yNoiseVel: (Math.random() - 0.5) * 0.25,
      turnBias: (Math.random() - 0.5) * 0.03,
      dirTarget: dir,
      turnChance: 0.015 + Math.random() * 0.035,
      turnSmoothing: 1.5 + Math.random() * 1.2,
      turnTimer: 0.4 + Math.random() * 1.8,
      sizePx: this.#baseSizeAtDist(distBottom, this.metrics.h) * this.config.globalScale * this.#depthSizeMul(distBottom),
      indivSpeedMul,
      frameIndex: Math.floor(Math.random() * this.config.sheepFrameCount),
      frameTimer: 0,
      frameRate: 5,
      offscreenTime: visible ? 0 : 1.8 + Math.random() * 2.8,
    };
  }

  #isTooClose(candidate, others) {
    for (const o of others) {
      const dx = candidate.x - o.x;
      const dy = candidate.y - o.y;
      const d2 = dx * dx + dy * dy;
      const distBottom = this.#distBottomFromY(candidate.y);
      const baseA = this.#baseSizeAtDist(distBottom, this.metrics.h);
      const r = baseA * this.config.globalScale * this.#depthSizeMul(distBottom) * 0.65;
      const oDistBottom = this.#distBottomFromY(o.y);
      const baseB = this.#baseSizeAtDist(oDistBottom, this.metrics.h);
      const or = baseB * this.config.globalScale * this.#depthSizeMul(oDistBottom) * 0.65;
      const minD = r + or;
      if (d2 < minD * minD) return true;
    }
    return false;
  }

  #spawnVisible(id, slot) {
    const m = this.metrics;
    let x = 0;
    let y = 0;
    let tries = 0;
    do {
      x = -this.config.wrapMargin + Math.random() * (m.w + this.config.wrapMargin * 2);
      y = this.#sampleLayeredVisibleY(slot + tries, this.config.targetVisible);
      tries += 1;
    } while (tries < 8 && this.#isTooClose({ x, y }, this.sheep));
    return this.#makeSheep(id, x, y, true);
  }

  #spawnOffscreen(id) {
    const m = this.metrics;
    const x = Math.random() < 0.5
      ? -this.config.wrapMargin * (0.2 + Math.random() * 1.2)
      : m.w + this.config.wrapMargin * (0.2 + Math.random() * 1.2);
    const y = Math.random() < 0.55
      ? m.maxYSoft + Math.random() * this.config.wrapMargin
      : m.minYSoft - 12 - Math.random() * 28;
    return this.#makeSheep(id, x, y, false);
  }

  #initSheep() {
    for (let i = 0; i < this.config.sheepTotal; i += 1) {
      if (i < this.config.targetVisible) {
        this.sheep.push(this.#spawnVisible(i, i));
      } else {
        this.sheep.push(this.#spawnOffscreen(i));
      }
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
    Promise.all(loads).then((ok) => {
      this.imagesReady = ok.every(Boolean);
    });
  }

  #visibleCount() {
    const m = this.metrics;
    return this.sheep.filter((s) => s.x >= 0 && s.x <= m.w && s.y >= m.yTop && s.y <= m.yBottom).length;
  }

  #applySeparation(dt) {
    const k = this.config.separationStrength;
    const rm = this.config.separationRadiusMul;
    for (let i = 0; i < this.sheep.length; i += 1) {
      const a = this.sheep[i];
      for (let j = i + 1; j < this.sheep.length; j += 1) {
        const b = this.sheep[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= 0.0001) continue;

        const desired = (a.sizePx + b.sizePx) * rm;
        if (dist >= desired) continue;

        const push = ((desired - dist) / desired) * k;
        const nx = dx / dist;
        const ny = dy / dist;
        const impulse = push * dt;

        a.vx -= nx * impulse;
        a.yVel -= ny * impulse;
        b.vx += nx * impulse;
        b.yVel += ny * impulse;
      }
    }
  }

  update(dt) {
    this.metrics = this.#buildMetrics();
    const m = this.metrics;
    const visibleCount = this.#visibleCount();
    const deficit = this.config.targetVisible - visibleCount;

    for (const s of this.sheep) {
      s.yDrift += s.yNoiseVel * dt;
      s.yNoiseVel += (Math.random() - 0.5) * 0.15 * dt;
      s.yNoiseVel *= 0.992;
      s.yNoiseVel = Math.max(-0.55, Math.min(0.55, s.yNoiseVel));
      const noiseForce = Math.sin(s.yDrift) * this.config.yDriftStrength;

      let boundaryPull = 0;
      if (s.y < m.minYSoft) boundaryPull += (m.minYSoft - s.y) * 0.22;
      if (s.y > m.maxYSoft) boundaryPull -= (s.y - m.maxYSoft) * 0.18;

      s.yVel += (noiseForce + boundaryPull) * dt;
      s.yVel *= this.config.yDamping;
      s.yVel = Math.max(-this.config.yMaxVel, Math.min(this.config.yMaxVel, s.yVel));
      s.y += s.yVel * dt;

      s.turnTimer -= dt;
      if (s.turnTimer <= 0) {
        if (Math.random() < s.turnChance) {
          s.dirTarget = Math.random() < 0.5 ? -1 : 1;
        }
        s.turnTimer = 0.8 + Math.random() * 2.2;
      }

      if (Math.random() < this.config.wanderTurnChancePerSec * dt) {
        s.turnBias += (Math.random() - 0.5) * this.config.maxTurnRate;
      }
      s.turnBias *= 0.94;

      const distBottom = this.#distBottomFromY(s.y);
      const baseSizePx = this.#baseSizeAtDist(distBottom, m.h);
      const depthSizeMul = this.#depthSizeMul(distBottom);
      const depthSpeedMul = this.#depthSpeedMul(distBottom);
      s.sizePx = baseSizePx * this.config.globalScale * depthSizeMul;

      const depthRatio = baseSizePx / this.#baseSizeAtDist(0, m.h);
      const speedCurve = Math.pow(Math.max(0.05, depthRatio), 1.6);
      const speedBase = this.config.baseSpeedMin + speedCurve * (this.config.baseSpeedMax - this.config.baseSpeedMin);
      const speedTarget = speedBase * depthSpeedMul * s.indivSpeedMul;

      const desiredVx = s.dirTarget * speedTarget;
      s.vx += (desiredVx - s.vx) * Math.min(1, dt * s.turnSmoothing);
      s.vx += s.turnBias;

      s.x += s.vx * dt;
      if (s.x < m.wrapLeft) {
        s.x = m.wrapRight - (m.wrapLeft - s.x);
      } else if (s.x > m.wrapRight) {
        s.x = m.wrapLeft + (s.x - m.wrapRight);
      }

      if (s.y < m.minYHard) {
        s.y += (m.minYHard - s.y) * 0.12;
        s.yVel *= 0.7;
      }
      if (s.y > m.maxYHard) {
        s.y -= (s.y - m.maxYHard) * 0.12;
        s.yVel *= 0.7;
      }

      const inView = s.x >= 0 && s.x <= m.w && s.y >= m.yTop && s.y <= m.yBottom;
      s.offscreenTime = inView ? 0 : s.offscreenTime + dt;

      if (deficit > 2 && !inView && s.offscreenTime > 1.8 && Math.random() < this.config.offscreenReturnBoost * dt) {
        s.x = Math.random() < 0.5 ? -8 : m.w + 8;
        s.y = this.#sampleLayeredVisibleY((s.id + Math.floor(performance.now() / 700)) % 7, this.config.targetVisible);
        s.yVel *= 0.5;
      }

      s.frameRate = 4 + speedCurve * 5 + Math.min(2.8, Math.abs(s.vx) / 19);
      s.frameTimer += dt;
      const frameDuration = 1 / s.frameRate;
      while (s.frameTimer >= frameDuration) {
        s.frameTimer -= frameDuration;
        s.frameIndex = (s.frameIndex + 1) % this.config.sheepFrameCount;
      }
    }

    this.#applySeparation(dt);
  }

  #drawPlaceholder(ctx, sheep) {
    const w = sheep.sizePx * 1.4;
    const h = sheep.sizePx;
    ctx.fillStyle = "#f7f7f2";
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.42, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2e2e2e";
    ctx.beginPath();
    ctx.arc(w * 0.32, h * 0.03, h * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-w * 0.22, h * 0.15, h * 0.08, h * 0.24);
    ctx.fillRect(-w * 0.01, h * 0.15, h * 0.08, h * 0.24);
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
