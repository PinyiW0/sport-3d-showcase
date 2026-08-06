# pitch-pose-data — 投球姿態的資料層

> **渲染器無關**，零 npm 依賴（連 `vue` 都不用）。
> Three.js 版（`pitch-pose/`）與 Plotly 版（`pitch-pose-plotly/`）都吃這一份。

## 為什麼獨立成一個資料夾

`outcome.json` 的解析、時間軸查找、COCO-17 拓樸、軸範圍計算——這些跟「用什麼畫」
完全無關。獨立出來之後：

- **要哪一版就搬哪個資料夾**：搬 Three.js 版帶 `pitch-pose/` + 這個 + `scene3d/`；
  搬 Plotly 版帶 `pitch-pose-plotly/` + 這個（不必碰 `scene3d/`）
- **兩版讀數不會分岔**：軸範圍由同一個 `computeSkeletonBounds()` 算，換渲染器不會讓數字跑掉
- 未來的「打者姿態 3D 骨架」（registry 裡的 planned 模組）直接複用同一份

## 檔案

| 檔案 | 責任 |
|------|------|
| `core/parsePitchOutcome.ts` | `outcome.json` → `PitchPose3d`（時間戳解析、缺測補 null） |
| `core/findPoseFrame.ts` | 時間軸二分搜尋「最後一個 `timestampMs <= timeMs`」的幀 |
| `core/types.ts` | COCO-17 keypoint 名稱與骨架連線（`SKELETON_EDGES`） |
| `core/skeletonBounds.ts` | 整段動作的軸範圍（含 padding 與 10cm 圓整） |

四個檔案都有對應的 `.spec.ts`——這些測試就是資料慣例的可執行規格，交接時一起帶走。

## 座標慣例

x = 左右（捕手視角）、y = 投手方向距離、z = 高度，單位 **cm**，z-up。

`Range3` 在這裡自己定義而非從 `scene3d` 引入：資料層要能被 Plotly 版單獨帶走，
不該相依任何 three 專用的東西。與 `scene3d` 的同名型別結構相同，可直接互通。
