# BT3D 落點圖(`/bt3d-demo`)

> 搬入自 `internal-template` @ `feature/strike-zone` 的 `doc/bt3d.md`,已依本 repo 結構改寫路徑。
> 與來源的差異:25 球資料合併成單一 `pitches.json` 靜態檔(不再用 build-time glob)。

2D 好球帶九宮格落點圖:列出所有投球,點選任一球後在捕手視角的好球帶框中顯示落點,並判定好球/壞球。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `app/pages/bt3d-demo.vue` | 頁面:球列表與選球邏輯、好壞球統計 |
| `app/composables/useBt3dSamples.ts` | 樣本載入(與 `pitch-trajectory` 共用同一份 25 球資料) |
| `public/samples/bt3d/pitches.json` | 樣本(25 球合併,18KB) |
| `app/components/strike-zone-grid/StrikeZone.vue` | SVG 渲染九宮格、本壘板裝飾、落點圓點 |
| `app/components/strike-zone-grid/core/useStrikeZoneScale.ts` | 座標轉換、縮放、九宮格幾何、好壞球判定(純邏輯,有單元測試) |
| `app/components/strike-zone-grid/core/types.ts` | `StrikeZone`、`PitchLocation` 型別定義 |

## 實作方式

### 資料流

```
public/samples/bt3d/pitches.json(25 球陣列,每筆帶 ts = ISO 時間戳)
  ↓ useBt3dSamples():client 端  靜態檔               useBt3dSamples.ts
  ↓ 取 strike_zone_point 的 [0](x)與 [2](z),單位 cm          useBt3dSamples.ts
  ↓ pitchFromStrikeZonePoint():cm ÷ 30.48 → 英尺 px/pz         useStrikeZoneScale.ts:35-44
  ↓ isStrike():與固定 175cm 好球帶邊界比對                      useStrikeZoneScale.ts:227-229
  ↓ <StrikeZone> 以 createStrikeZoneScale() 算出 SVG 座標後渲染
```

### 演算法

**1. 好球帶邊界(`strikeZoneFromHeight`,`useStrikeZoneScale.ts:22-28`)**

```
sz_top = 0.535 × 175cm ÷ 30.48 ≈ 3.071 ft(93.6 cm)
sz_bot = 0.27  × 175cm ÷ 30.48 ≈ 1.550 ft(47.3 cm)
plate_half_width = 0.708 ft(21.59 cm,17 吋本壘板半寬)
```

後端資料不含打者身高,因此固定用 175 cm(`bt3d-demo.vue`)。

**2. 世界座標 → SVG 座標(`useStrikeZoneScale.ts:146-149`)**

捕手視角需左右鏡像(X 軸反轉),SVG 原點在左上所以 Y 軸也反轉:

```ts
toSvg(px, pz) = {
  x: (xMax - px) * scale, // X 反轉:世界座標右側顯示在畫面左側
  y: (yMax - pz) * scale, // Y 反轉:世界 z 向上 → SVG y 向下
}
```

縮放因子 `scale = viewWidth / worldWidth`,X/Y 共用同一因子避免變形;
`worldWidth`/`worldHeight` 為好球帶加上 `paddingFraction`(預設 0.5,即 50% 邊距)後的範圍,SVG 高度依比例自動推得。

**3. 九宮格切分(`useStrikeZoneScale.ts:164-207`)**

好球帶等分 3×3:`colStep = zoneWidth / 3`、`rowStep = zoneHeight / 3`,產生 2 條內部垂直線、2 條內部水平線、外框與 9 個格子(編號 1–9,由左上至右下,已考慮 X 軸鏡像)。

**4. 好壞球判定(`useStrikeZoneScale.ts:210-229`)**

```text
isInZone(px, pz) = px ∈ [-halfWidth, halfWidth] 且 pz ∈ [sz_bot, sz_top]
isStrike(pitch)  = pitch.is_strike ?? isInZone(pitch.px, pitch.pz)
```

資料若自帶 `is_strike` 以資料為準,否則以落點是否在框內判定。

### 渲染

純 SVG(`StrikeZone.vue`),無第三方繪圖庫:

- `<rect>` × 9 格 + `<line>` 內線 + `<rect>` 外框
- 可選裝飾層(`show-field`):本壘板 `<polygon>` 與打者站位框,用單點透視投影生成(`createFieldLayout`,`useStrikeZoneScale.ts:318-388`)
- 落點 `<circle>`:好球 `fill-primary-500`(綠)、壞球 `fill-error-400`(紅)

## 資料來源需要的欄位

輸入:`public/samples/bt3d/pitches.json`(25 球合併成一個陣列;來源為後端每球一份的 `analysis_result.json`)。

### 必要欄位

| 欄位 | 型別 | 單位 | 用途 |
|------|------|------|------|
| `strike_zone_point` | `[number, number, number]` | cm | 入壘點 `[x, y, z]`。**只用 `[0]`(x,左右)與 `[2]`(z,高度)**;`[1]`(y)恆為 21.59(本壘板前緣平面),不使用 |
| `ts` | ISO-8601 字串 | — | 排序與顯示投球時間(HH:MM:SS)。來源為每球的資料夾名,合併樣本時存成此欄位 |

也就是說,**做出落點圖的最低需求只有每球的入壘點 x/z 座標與時間戳**;好球帶框本身由前端常數計算,不需後端提供。

### analysis_result.json 內其他欄位(此頁未使用)

| 欄位 | 型別 | 單位 | 說明 |
|------|------|------|------|
| `pitch_trajectory` | `number[20][3]` | cm | 內插後 3D 軌跡(pitch3d 頁使用,見 [pitch-trajectory/README.md](../pitch-trajectory/README.md)) |
| `pitch_velocity` | `number \| null` | km/h | 球速 |
| `raw_traj` | `number[][4]` | **公尺**、秒 | 原始追蹤點 `[x, y, z, t]` |
| `raw_traj_2d` | object(`cam0`/`cam1`) | px | 各相機的 2D 偵測軌跡 |
| `pitch_traj_Xc0~2` / `Yc0~2` / `Zc0~2` | `number` | 公尺 | 對時間的二次多項式係數(見 pitch-trajectory/README.md) |
| `x_coefficients` / `z_coefficients` | `number[3]` | — | X、Z 對 Y 的二次擬合係數 |
| `x_r_squared` / `z_r_squared` | `number` | — | 擬合品質 R² |
| `horizontal_offset` / `vertical_offset` | `number` | cm | 落點偏移統計 |
| `traj_start_ts` / `traj_end_ts`、`y_range`、`exit_velocity`、`timestamp` | — | — | 軌跡時間範圍、Y 範圍、擊球初速(多為 null)、記錄時間 |
