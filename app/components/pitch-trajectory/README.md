# BT3D 軌跡圖(`/pitch3d-demo`)

> 25 球資料合併成單一 `pitches.json` 靜態檔(不用 build-time glob)。

3D 投球軌跡圖:列出所有投球,點選任一球後以 **Three.js** 3D 場景顯示該球軌跡、出手點、入壘點、本壘板與好球帶九宮格,可拖曳旋轉視角。同頁可切 Plotly 對照版並列比對。

## 相關檔案

**這個資料夾只裝 Three.js 版。** 渲染器分家成三個資料夾，要哪一版就搬哪一組：

| 要什麼 | 搬哪些 |
|--------|--------|
| **Three.js 版**（本資料夾） | `pitch-trajectory/` + `pitch-trajectory-data/` + `scene3d/` + `baseball-field/` |
| **Plotly 對照版** | `pitch-trajectory-plotly/` + `pitch-trajectory-data/` + `baseball-field/` + `app/types/plotly.d.ts`（不需要 `scene3d/`） |

`npm run eslint` 會印出每個模組「需一併帶走」的清單，以那份為準。

| 檔案 | 責任 |
|------|------|
| `app/pages/pitch3d-demo.vue` | 頁面:球列表(含球速)、選球邏輯、渲染器與相機距離切換 |
| `app/composables/useBt3dSamples.ts` | 樣本載入(與 `strike-zone-grid` 共用同一份 25 球資料) |
| `app/components/pitch-trajectory/PitchTrajectoryChart.vue` | Three.js 渲染的 Vue 薄殼(~50 行) |
| `app/components/pitch-trajectory/core/trajectoryScene.ts` | **軌跡場景本體(框架無關 class)**——換到 React／Svelte 只要重寫薄殼 |
| `app/components/pitch-trajectory-data/` | **外部依賴**:軌跡解析、場地幾何、軸範圍、`CHART_THEME`——兩種渲染器共用,必須一併帶上 |
| `app/components/scene3d/` | **外部依賴**:three 場景樣板與 3D 軸盒。只有 Three.js 版需要 |
| `app/components/baseball-field/core/fieldGeometry.ts` | **外部依賴**:場地與好球帶常數的單一來源(cm),由資料層直接使用。規格見 [spec/domain/baseball-field-coordinates.md](../../../spec/domain/baseball-field-coordinates.md) |
| `app/components/pitch-trajectory-plotly/` | Plotly 對照版(props 介面相同可直接互換) |
| `public/samples/bt3d/pitches.json` | 樣本(25 球合併,18KB) |

**幾何與配色由 `pitch-trajectory-data` 單一供應**,Three.js 版與 Plotly 對照版共用同一份計算(`buildHomePlateGeometry` / `buildStrikeZoneLines` / `computeTrajectoryRange` / `CHART_THEME`),形狀與顏色不會分岔。

**未搬入**:來源的早期版本 3D 圖(`app/components/3d/BaseballChart.vue`、`app/utils/useBaseball3d.ts`),在來源已無頁面使用。

## 實作方式

### 資料流

```
public/samples/bt3d/pitches.json
  ↓ useBt3dSamples():client 端 $fetch 靜態檔                   useBt3dSamples.ts
  ↓ parsePitchTrajectory():驗證並取出 pitch_trajectory          trajectoryGeometry.ts
  ↓ 軌跡末點 = 入壘點(顯示 x/z);pitch_velocity 顯示於列表     useBt3dSamples.ts
  ↓ <PitchTrajectoryChart :trajectory>
      TrajectoryScene.setTrajectory():
      ├ computeTrajectoryRange()    軸範圍 → scene3d 的 createAxisBox()
      ├ 軌跡線 Line2 + 取樣點 Points + 出手/入壘球體
      ├ buildStrikeZoneLines()      九宮格(角點由 buildStrikeZoneCorners 算出)
      └ buildHomePlateGeometry()    本壘板 BufferGeometry(建構時一次,不隨球重建)
  ↓ Viewport.frameBox() 依資料範圍框相機 → rAF 迴圈渲染
```

### 演算法

**1. 軌跡解析(`parsePitchTrajectory`,`trajectoryGeometry.ts`)**

`pitch_trajectory` 為後端輸出的 20 個內插點(cm)。前端逐點驗證「至少 3 個有限數值」,取前三個值為 `[x, y, z]`,不足 2 點的球整筆過濾掉(`useBt3dSamples.ts`)。首點即出手點(y 最大,約 1600 cm),末點即入壘點(與 `strike_zone_point` 相同)。

**2. 九宮格角點(`buildStrikeZoneCorners`,`trajectoryGeometry.ts`)**

```
zTop    = 0.535 × 175(打者身高 cm)
zBottom = 0.27  × 175
x = ±21.59(本壘板半寬 cm)
y = 軌跡末點的 y(入壘平面,約 21.59 cm)
```

四個角點構成入壘平面上的矩形,再用 `linspace(start, end, 4)` 等分出中間 2 條橫線與 2 條直線(`buildStrikeZoneLines`)。

**3. 本壘板(`buildHomePlateGeometry`)**

五邊形頂面(尖端朝捕手 y=0,前緣 y=43.18 cm)往下擠出厚度 3 cm:頂面 3 個三角形、底面 3 個、側面 5 邊 × 2 個。回傳頂點與面索引,Three.js 版直接餵 `BufferGeometry`,Plotly 對照版轉成 `mesh3d` 的 `i/j/k`。

**4. 軸範圍與相機(`computeTrajectoryRange` + `TrajectoryScene.frameCamera`)**

```text
// 軸範圍:涵蓋所有軌跡點,保底 x ±150 / y 600 / z 180,向上取整到 100cm
range.x = ±roundUpTo(max|x| + 20, 100)
range.y = [-100, roundUpTo(maxY + 50, 100)]
range.z = [0,    roundUpTo(maxZ + 20, 100)]

// 等比例:不需要換算——three 的世界單位直接是 cm
// (Plotly 版得靠 aspectratio 把空間壓成「每 200cm = 1 視覺單位」再鎖 aspectmode: 'manual')

// 相機:本壘板後方偏右上往投手方向看,方向沿用 Plotly 版的 eye 比例,
// 距離由 Viewport.frameBox() 逐角投影算出剛好框住的值,再乘 zoom
eyeDir = (aspect.x × 1.4, −aspect.y × 1.1, aspect.z × 0.5)
```

框的範圍是「軸範圍 + `LABEL_MARGIN` 那一圈」:刻度與軸標題掛在盒外,只框盒子會把它們裁掉。

### 渲染

物件組成(`core/trajectoryScene.ts`):

| 物件 | 型別 | 內容 |
|------|------|------|
| 軌跡線 | `Line2` | 琥珀黃(#FFC107)線寬 2px |
| 軌跡取樣點 | `Points`(`sizeAttenuation: false`) | 琥珀黃 3.5px |
| 出手點 | `Mesh`(球) | 琥珀黃,半徑 6cm |
| 入壘點 | `Mesh`(球) | 深紅(#A40C17),半徑 8cm |
| 本壘板 | `Mesh`(`BufferGeometry`) | 灰色、flatShading,配環境光 + 主光 |
| 九宮格 | `Line2` + `LineSegments2` | 白色外框(寬 3px)+ 內線(寬 1.5px) |
| 軸盒 | `scene3d` 的 `createAxisBox()` | 外框 + 背板格線 + 刻度數字 + 軸標題 |

**兩個非顯而易見的必要設定**:

- 線一律用 `Line2`／`LineSegments2` 而非 `Line`——three 的 `LineBasicMaterial.linewidth` 在絕大多數平台**恆為 1px**,九宮格外框的寬 3 會變成髮絲。代價是 resize 時要同步 `material.resolution`。
- 軌跡取樣點用**螢幕空間**(`sizeAttenuation: false`)而非 world 單位小球:場景 y 深達 1800cm,world 單位的小球投影後不到 1px 就消失,而「軌跡是離散取樣的」正是這些點要傳達的資訊。出手/入壘點則相反,它們是空間中的實體位置,用 world 單位才有 3D 縱深感。

### 配色

暗色主題:純黑畫布(`#000000`)、白色軸文字配 `#444` 格線、琥珀黃軌跡、深紅入壘點。

整組色值集中在 `pitch-trajectory-data/core/trajectoryGeometry.ts` 的 `CHART_THEME` 常數,換主題只需改這裡(兩個渲染器讀同一組)。軸範圍為動態計算(而非寫死的固定範圍,那樣換不同長度的軌跡會被裁切)。

## 資料來源需要的欄位

輸入:`public/samples/bt3d/pitches.json`(25 球合併成一個陣列;來源為後端每球一份的 `analysis_result.json`)。

### 必要欄位

| 欄位 | 型別 | 單位 | 用途 |
|------|------|------|------|
| `pitch_trajectory` | `number[][3]`(實際 20 點) | cm | 3D 軌跡點序列 `[x, y, z]`,首點=出手、末點=入壘。**至少 2 點**,整張圖的核心輸入 |
| `ts` | ISO-8601 字串 | — | 排序與顯示投球時間(來源為每球的資料夾名,合併樣本時存成此欄位) |

### 選用欄位

| 欄位 | 型別 | 單位 | 用途 |
|------|------|------|------|
| `pitch_velocity` | `number \| null` | km/h | 球列表顯示球速;null 顯示 `— km/h` |

九宮格、本壘板皆由前端常數計算,不需後端欄位。

### 軌跡的上游演算法欄位(前端未直接使用,供追溯)

`pitch_trajectory` 是後端由原始追蹤點擬合、內插而來,相關欄位:

| 欄位 | 型別 | 單位 | 說明 |
|------|------|------|------|
| `raw_traj` | `number[][4]` | **公尺**、秒 | 原始三角測量點 `[x, y, z, t]`(約 126–129 點) |
| `raw_traj_2d` | `{ cam0, cam1 }` | px | 各相機平面上的 2D 偵測點(含時間戳) |
| `traj_start_ts` / `traj_end_ts` | `number` | 秒 | 軌跡時間範圍(如 0.0 ~ 0.43s) |
| `pitch_traj_Xc0~2`、`Yc0~2`、`Zc0~2` | `number` | 公尺 | 對時間的二次多項式係數:`X(t) = Xc0 + Xc1·t + Xc2·t²`(Y、Z 同理)。`pitch_trajectory` 即以此在時間範圍內取 20 個等距 t 求值 ×100 換算為 cm |
| `x_coefficients` / `z_coefficients` | `number[3]` | — | 以深度 Y 為自變數的二次擬合:`X = a·Y² + b·Y + c`(Z 同理) |
| `x_r_squared` / `z_r_squared` | `number` | — | 上述擬合的 R²(此份資料約 0.98 / 0.995) |
| `y_range` | `number[2]` | cm | 擬合有效的 Y 範圍 |
| `strike_zone_point` | `number[3]` | cm | 入壘點(= `pitch_trajectory` 末點;bt3d 頁使用) |
| `horizontal_offset` / `vertical_offset` | `number` | cm | 相對好球帶中心的落點偏移 |
