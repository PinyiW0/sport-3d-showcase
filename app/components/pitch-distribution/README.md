# 落點分布圖

一批投球在好球帶上的分布：九宮格熱區看集中在哪，散點疊圖看實際散布與框外的球，可依投手與球種篩選。

與 `strike-zone-grid` 的分工：那支答「**這一球**落在第幾格、是好是壞」，本模組答「**這批球**集中在哪、控球散不散」。輸入、輸出、互動都不同，所以是兩個模組。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `app/components/pitch-distribution/PitchDistribution.vue` | SVG 渲染：熱區、九宮格、散點 |
| `app/components/pitch-distribution/core/distribution.ts` | 篩選、九宮格聚合、散點 path 產生（純 TS，有單元測試） |
| `app/components/pitch-distribution/core/useDistributionScale.ts` | 座標與視野（純 TS + vue 的 computed，有單元測試） |
| `app/components/baseball-field/core/fieldGeometry.ts` | **本模組的外部依賴**：場地與好球帶常數的單一來源（cm），本模組直接使用同單位。整包 cp 時要一併帶走。規格見 [spec/domain/baseball-field-coordinates.md](../../../spec/domain/baseball-field-coordinates.md) |
| `app/composables/useDistributionSamples.ts` | 樣本載入（Nuxt 專用，非 Nuxt 環境自行替換） |
| `public/samples/bt3d/distribution.json` | 樣本（600 球，79KB，**合成資料**） |
| `scripts/gen-distribution-sample.mjs` | 樣本生成腳本，`npm run gen:sample` 重跑（固定 seed，結果可重現） |

## 實作方式

### 為什麼散點合併成單一 path

每顆點一個 `<circle>` 的話，600 顆就是 600 個 DOM 節點，上千顆會開始卡。`buildPointsPath()` 把同色的點合併成一條 `<path>`，**好球一條、壞球一條，總共 2 個節點**，點數再多都一樣。

代價是失去逐點的 `<title>` 與 testid。這對分布圖是對的取捨——單球查詢是 `strike-zone-grid` 的職責，本模組的互動錨點掛在九宮格的 9 個 `<rect>` 上（`data-testid="distribution-cell-N"`），數量固定。

### 為什麼用 fill-opacity 疊密度

散點重疊會糊成一片，所以點填色只給 `fill-opacity="0.32"`。重疊處自然變深，**不必真的算 KDE 就有熱區效果**。九宮格熱區同理：同一個語意色 `fill-primary-500`，深淺全靠 `fill-opacity`，不需要任意值色階（也才過得了 `visual-hierarchy-check`）。

### 座標

一律用 cm，與 `fieldGeometry` 同單位，**不轉英尺**。`strike-zone-grid` 轉英尺是為了對齊 MLB 的 px/pz 慣例，本模組沒有這個包袱。

**SVG 單位 = 1cm**，所以 viewBox 天然等比例，分布形狀不會被拉扁，也不需要 scale 因子。

### 視野

好球帶四周各留一倍好球帶尺寸（`paddingFraction` 預設 1），且下緣不低於地面。**視野固定不隨資料變動**——切換篩選時圖不會跳動，不同投手的分布才能直接比對。

落在視野外的球不繪製（clamp 到邊緣會造成四周假聚集），改在右下角標示球數。

### 九宮格聚合

好球帶外的球只計入 `total`，不進任何一格。`getZoneCell()` 會把界外點夾到最近的邊格，直接拿它做統計會讓邊格灌水，所以 `aggregateByCell()` 先用 `isStrike()` 過濾。

## 資料來源需要的欄位

輸入：`public/samples/bt3d/distribution.json`，格式沿用後端 `analysis_result.json` 的 snake_case 子集。

| 欄位 | 型別 | 單位 | 用途 |
|------|------|------|------|
| `strike_zone_point` | `[number, number, number]` | cm | 入壘點 `[x, y, z]`。只用 `[0]`（x）與 `[2]`（z）；`[1]` 恆為 21.59，不使用 |
| `pitcher` | string | — | 投手識別，篩選維度 |
| `pitch_type` | string | — | 球種代碼（FF/SI/SL/CU/CH），篩選維度 |
| `ts` | ISO-8601 字串 | — | 排序用 |
| `pitch_velocity` | `number \| null` | km/h | 目前未用於繪圖，保留供之後的球速維度 |

不需要 `pitch_trajectory`——分布圖只看入壘點，帶軌跡會讓檔案膨脹數倍。

> **樣本是合成的。** 現有 `pitches.json` 只有 25 球且沒有 `pitcher` / `pitch_type` 欄位，撐不起篩選。各球種的落點中心依球種特性設定（速球偏高、變化球偏低）是示意值，不是量測值。接真實資料時只要換掉 JSON 即可，欄位不用改。
