# BT3D 軌跡圖(`/pitch3d-demo`)

> 搬入自 `internal-template` @ `feature/strike-zone` 的 `doc/pitch3d.md`,已依本 repo 結構改寫路徑。
> 與來源的差異:25 球資料合併成單一 `pitches.json` 靜態檔(不再用 build-time glob)。

3D 投球軌跡圖:列出所有投球,點選任一球後以 Plotly 3D 場景顯示該球軌跡、出手點、入壘點、本壘板與好球帶九宮格,可拖曳旋轉視角。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `app/pages/pitch3d-demo.vue` | 頁面:球列表(含球速)、選球邏輯、相機距離切換 |
| `app/composables/useBt3dSamples.ts` | 樣本載入(與 `strike-zone-grid` 共用同一份 25 球資料) |
| `app/components/pitch-trajectory/PitchTrajectoryChart.vue` | Plotly 圖表元件(動態載入 plotly、`plotly.react()` 渲染) |
| `app/components/pitch-trajectory/core/usePitch3d.ts` | 純函式模組:軌跡解析、九宮格角點、traces/layout 建構(有單元測試) |
| `app/components/baseball-field/core/fieldGeometry.ts` | **本模組的外部依賴**:場地與好球帶常數的單一來源(cm),本模組直接使用。整包 cp 時要一併帶走。規格見 [spec/domain/baseball-field-coordinates.md](../../../spec/domain/baseball-field-coordinates.md) |
| `public/samples/bt3d/pitches.json` | 樣本(25 球合併,18KB) |

**未搬入**:來源的早期版本 3D 圖(`app/components/3d/BaseballChart.vue`、`app/utils/useBaseball3d.ts`),在來源已無頁面使用。

## 實作方式

### 資料流

```
public/samples/bt3d/pitches.json
  ↓ useBt3dSamples():client 端 $fetch 靜態檔                   useBt3dSamples.ts
  ↓ parsePitchTrajectory():驗證並取出 pitch_trajectory          usePitch3d.ts:63-70
  ↓ 軌跡末點 = 入壘點(顯示 x/z);pitch_velocity 顯示於列表     useBt3dSamples.ts
  ↓ <PitchTrajectoryChart :trajectory>
      ├ createTrajectoryTraces()   軌跡線 + 出手/入壘標記
      ├ createHomePlateTrace()     本壘板 mesh3d
      ├ createStrikeZoneTraces()   九宮格(角點由 buildStrikeZoneCorners 算出)
      └ createChartLayout()        軸範圍、等比例、相機
  ↓ plotly.react() 渲染
```

### 演算法

**1. 軌跡解析(`parsePitchTrajectory`,`usePitch3d.ts:63-70`)**

`pitch_trajectory` 為後端輸出的 20 個內插點(cm)。前端逐點驗證「至少 3 個有限數值」,取前三個值為 `[x, y, z]`,不足 2 點的球整筆過濾掉(`useBt3dSamples.ts`)。首點即出手點(y 最大,約 1600 cm),末點即入壘點(與 `strike_zone_point` 相同)。

**2. 九宮格角點(`buildStrikeZoneCorners`,`usePitch3d.ts:77-89`)**

```
zTop    = 0.535 × 175(打者身高 cm)
zBottom = 0.27  × 175
x = ±21.59(本壘板半寬 cm)
y = 軌跡末點的 y(入壘平面,約 21.59 cm)
```

四個角點構成入壘平面上的矩形,再用 `linspace(start, end, 4)` 等分出中間 2 條橫線與 2 條直線(`usePitch3d.ts:169-213`),線段間以 `null` 分段讓 Plotly 自動斷線。

**3. 本壘板(`createHomePlateTrace`,`usePitch3d.ts:135-161`)**

五邊形頂面(尖端朝捕手 y=0,前緣 y=43.18 cm)往下擠出厚度 3 cm,以 `mesh3d` 的 `i/j/k` 面索引組成:頂面 3 個三角形、底面 3 個、側面 5 邊 × 2 個。

**4. 軸範圍與相機(`createChartLayout`,`usePitch3d.ts:233-286`)**

```text
// 軸範圍:涵蓋所有軌跡點,保底 x ±150 / y 600 / z 180,向上取整到 100cm
range.x = ±roundUpTo(max|x| + 20, 100)
range.y = [-100, roundUpTo(maxY + 50, 100)]
range.z = [0,    roundUpTo(maxZ + 20, 100)]

// 等比例:每 200cm = 1 視覺單位(aspectmode: 'manual',避免軸比例失真)
aspect = 各軸長度 / 200

// 相機:本壘板後方偏右上往投手方向看
eye = { x: aspect.x × 1.4, y: -aspect.y × 1.1, z: aspect.z × 0.5 } × zoom
```

### 渲染

Plotly.js(`plotly.js-dist-min`,`onMounted` 時動態 `import()`),trace 組成:

| Trace | 類型 | 內容 |
|-------|------|------|
| 軌跡線 | `scatter3d` lines+markers | 全部軌跡點,琥珀黃(#FFC107)線寬 2 |
| 出手點 | `scatter3d` markers | 軌跡首點,size 2 琥珀黃 |
| 入壘點 | `scatter3d` markers | 軌跡末點,size 4 深紅(#A40C17) |
| 本壘板 | `mesh3d` | 灰色、flatshading |
| 九宮格 | `scatter3d` lines × 2 | 白色外框(寬 3)+ 內線(寬 1.5) |

### 配色

暗色主題取自 `internal-project-b`(內部系統)的 `BaseballChart.vue`:純黑畫布(`#000000`)、繪圖區 `#181818`、軸面 x/z `#1a1a1a` 與 y `#282828`(進壘深度稍亮以區分前後)、白色軸文字配 `#444` 格線。

整組色值集中在 `usePitch3d.ts` 的 `CHART_THEME` 常數,換主題只需改這裡。軸範圍與 aspect 仍為動態計算(project-b 原版是寫死的 `x[-200,200] / y[-100,700] / z[0,200]`,換不同長度的軌跡會被裁切)。

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
