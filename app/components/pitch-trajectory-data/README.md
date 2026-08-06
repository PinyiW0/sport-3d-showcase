# pitch-trajectory-data — 投球軌跡的資料層

> **渲染器無關**，零 npm 依賴。
> Three.js 版（`pitch-trajectory/`）與 Plotly 版（`pitch-trajectory-plotly/`）都吃這一份。

## 為什麼獨立成一個資料夾

軌跡解析、本壘板與九宮格幾何、軸範圍、配色——這些跟「用什麼畫」無關。獨立之後：

- **要哪一版就搬哪個資料夾**：搬 Three.js 版帶 `pitch-trajectory/` + 這個 + `scene3d/` +
  `baseball-field/`；搬 Plotly 版帶 `pitch-trajectory-plotly/` + 這個 + `baseball-field/`
- **兩版形狀與顏色不會分岔**：本壘板五邊形、九宮格分格線、軸範圍、`CHART_THEME`
  都只有一份

## 檔案

`core/trajectoryGeometry.ts`（含 `.spec.ts`）：

| 匯出 | 用途 |
|------|------|
| `parsePitchTrajectory()` | `analysis_result.json` → 軌跡點（逐點驗證，格式不符就丟棄） |
| `buildStrikeZoneCorners()` | 打者身高 → 九宮格四角（左上→右上→右下→左下） |
| `buildStrikeZoneLines()` | 四角 → 外框閉合路徑 + 4 條內部分隔線 |
| `buildHomePlateGeometry()` | 本壘板 10 頂點 + 16 三角面（Plotly 轉 `i/j/k`、three 餵 `BufferGeometry`） |
| `computeTrajectoryRange()` | 軸範圍，取整到 100cm 並保底涵蓋場地元素 |
| `CHART_THEME` | 暗色主題配色，換主題只動這一組常數 |

## 外部依賴

`baseball-field/core/fieldGeometry`——場地與好球帶常數的單一來源（本壘板尺寸、
好球帶上下緣比例）。整包搬走時要一併帶上。規格見
[spec/domain/baseball-field-coordinates.md](../../../spec/domain/baseball-field-coordinates.md)。

## 座標慣例

原點為本壘板尖端、x = 左右（捕手視角）、y 正向朝投手、z = 高度，單位 **cm**，z-up。
