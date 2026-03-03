# 「只放羊」專案規格

## 目標
- 純前端原生技術（HTML/CSS/JS），不使用 npm、不需 build。
- 下載後以 Chrome 直接開啟 `index.html` 即可執行。
- 同一畫面穩定顯示：背景（影片或 fallback）+ 羊群。
- 邊界清楚：
  - 背景無縫循環邏輯只在 `src/bgVideoLoop.js`。
  - 羊群邏輯只在 `src/sheepEngine.js`。

## 座標與縮放定義（從底部算起）
- 參考基準高度：`REF_H = 225`。
- 所有距底距離都以比例換算到任何實際畫面高度 `canvasH`。
- 轉換式：`y = canvasH - (distBottom / REF_H) * canvasH`。
- 重要帶狀線：
  - 最高活動帶：距底 `130`，`yTop = canvasH - (130/225)*canvasH`。
  - 中間參考線：距底 `85`，`yMid = canvasH - (85/225)*canvasH`。
  - 底部：距底 `0`，`yBottom = canvasH`。

## 羊的尺寸規格（分段線性插值）
必須命中三個高度錨點：
- 距底 `130`：高度 `22.5`
- 距底 `85`：高度 `45`
- 距底 `0`：高度 `67.5`

使用兩段分段線性插值：
1. 距底 `130 -> 85` 一段。
2. 距底 `85 -> 0` 一段。

另外以 `globalScale=0.8` 套在最終渲染尺寸，讓整體羊群縮小到 80%。

## 羊群行為規格
- 總數固定 `30`。
- 常態目標：可見約 `20`、畫面外約 `10`。
- 初始化即分配兩群：
  - 可見區使用分層取樣（yTop..bottom 切段抽樣）避免排成幾條線。
  - 畫面外儲備分散在左右和底部外側。
- 初始化有輕量防重疊重抽，避免一開始疊在一起。
- 深度漂移採平滑 random-walk/noise + damping：
  - 每隻羊有獨立 `yVel`、`yDrift`、`yNoiseVel`。
  - 以低頻擾動推動深度前後移動，靠近邊界用拉回力，不反彈。
- 動態平衡：若可見數明顯偏離 20，使用溫和策略把羊帶回或帶出。
- 左右採環狀回歸（wrap-around），不做撞牆反彈。
- 底部可略超出，會被平滑拉回合理帶狀區。
- 方向改變採小機率平滑轉向，不依賴出界才轉。
- 速度與尺寸正相關：遠處小羊慢、近處大羊快，並加入個體差異。

## 羊素材與動畫規格
- 6 幀循環：`sheep_rf1` ~ `sheep_rf6`。
- 路徑：`assets/sheep/sheep_rf1.png` ~ `assets/sheep/sheep_rf6.png`。
- 每隻羊需有獨立：
  - `frameIndex`
  - `frameRate`（隨速度/深度微調）
- 若素材缺失，仍需可執行：使用 canvas placeholder 羊。
- 左行時使用水平翻轉繪製，不要求左向素材。
- 遮擋順序：每幀依 `y` 由小到大排序繪製，較下方（更近）自然蓋住上方羊。

## 背景影片規格
- 影片路徑固定：`assets/bg/grassland.MP4`，URL 以 `document.baseURI` 組合，支援子路徑部署。
- 若檔案不存在或不可播放，需有 fallback 背景（漸層）。
- 無縫循環不可依賴單一 `<video loop>`。
- 採雙影片交接且「只淡入不淡出」：
  - `front` 永遠以 alpha=1 繪製。
  - `back` 在 PREP 先暖機播放（不可見），到 FADE 才以 alpha 0->1 疊上。
  - alpha 到 1 立即 swap 角色，舊 front pause + reset。
- PREP 含穩定準備流程：pause/load、等 metadata/canplay、seek 到 0、確認 seek、play 並等 playing/ready。
- 交接期間亮度不下降，避免暗一下的斷裂感。
- 整體開場淡入：由黑畫面在 `0.8s` 內淡入到完整場景。
- 若 autoplay 被阻擋，顯示可點擊提示；點擊後開始播放與循環。

## 檔案結構
- `index.html`：全頁 canvas 與 `src/app.js` 載入。
- `style.css`：全頁鋪滿與隱藏捲動條。
- `src/config.js`：集中可調參數。
- `src/bgVideoLoop.js`：背景雙影片 PREP + only-fade-in 無縫循環。
- `src/sheepEngine.js`：羊群初始化、更新、排序、繪製、素材載入。
- `src/app.js`：canvas、resize、RAF 主迴圈、啟動流程與場景組裝。
