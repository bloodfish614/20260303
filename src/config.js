export const CONFIG = {
  REF_H: 225,
  yTopDist: 130,
  yMidDist: 85,
  sizeAtTop: 22.5,
  sizeAtMid: 45,
  sizeAtBottom: 67.5,
  globalScale: 0.8,

  depthSizeMulTop: 0.5,
  depthSizeMulMid: 0.8,
  depthSizeMulBottom: 1.0,
  depthSpeedMulTop: 0.5,
  depthSpeedMulMid: 1.0,
  depthSpeedMulBottom: 1.5,

  sheepTotal: 30,
  targetVisible: 20,
  targetOffscreen: 10,
  wrapMargin: 80,

  separationStrength: 1.1,
  separationRadiusMul: 0.45,
  yDriftStrength: 11,
  yDamping: 0.95,
  yMaxVel: 22,

  bgVideoPath: "assets/bg/grassland.MP4",
  xfadePrepSeconds: 1.2,
  xfadeSeconds: 1.0,
  introFadeSeconds: 0.8,

  sheepFramePrefix: "assets/sheep/sheep_rf",
  sheepFrameCount: 6,
  sheepFrameExt: ".png",

  baseSpeedMin: 12,
  baseSpeedMax: 30,
  wanderTurnChancePerSec: 0.2,
  maxTurnRate: 0.7,
  offscreenReturnBoost: 0.45,
};
