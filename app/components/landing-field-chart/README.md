# 預測落點球場圖

把一筆 BPE 結果的 `predicted_landing_point_m` 畫在俯視球場圖上：看的人要一眼看出球預測會落在
場上哪裡、飛多遠、偏左偏右。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `LandingFieldChart.vue` | SVG 渲染：球場邊界、裝飾、落點標記與標籤、其他事件的灰點 |
| `core/fieldChart.ts` | 球場邊界公式、視野計算、座標縮放（純 TS，有單元測試） |
| `app/components/modules/LandingFieldChartShowcase.vue` | 本專案專用的互動外殼：事件選單與上一筆／下一筆、裝飾與淺色畫布開關、畫布標籤與圖例、數值面板（消費端，非本模組一部分） |

## 用法

```vue
<LandingFieldChart
  :landing="{ x: 2.047, y: 56.224 }"
  :label="['56.3 m', '一壘側 2.9°']"
  :others="[{ id: 4, x: -16.1, y: 26.6, label: '事件 #4 · 31.1 m' }]"
  @select="id => (selected = id)"
/>
```

| prop | 型別 | 預設 | 說明 |
|------|------|------|------|
| `landing` | `{ x: number, y: number } \| null` | 必填 | 預測落點，單位公尺；`null` 代表這筆結果沒有落點 |
| `label` | `string \| string[] \| undefined` | `undefined` | 落點旁的標籤，給陣列就一行一項（第一行加粗），例如 `['56.3 m', '一壘側 2.9°']`；不給就只寫「預測落點」。由呼叫端格式化好傳入——元件不依賴 `bpe-data`，不會自己組字串 |
| `showDecorations` | `boolean` | `true` | 距離弧、內野菱形、投手板點；關閉不影響落點位置，只是少了參考線 |
| `dark` | `boolean` | `false` | 深色配色。不跟頁面 colorMode 走；SVG 本身透明，底色由呼叫端鋪（淺色配 `neutral-100`、深色配 `neutral-900`，落點與文字的描邊就是這兩個底色） |
| `others` | `FieldMarker[]` | `[]` | 其他事件的落點（`id`、`x`、`y`、選填 `label`），畫成淡灰小點、可點選。視野只依 `landing` 決定，灰點不讓視野擴大，落在視野外的不畫——呼叫端要提示筆數可用 `core/fieldChart.ts` 的 `isInViewport` 自己算 |
| `pointTitle` | `string` | 原始座標 | 落點的滑鼠提示 |

| 事件 | 參數 | 說明 |
|------|------|------|
| `select` | `id: number` | 點選（或 Tab 到灰點按 Enter／空白鍵）其他事件的灰點時發出，帶回該點的 `id` |

落點是紅色（本壘到落點的虛線也是）：界內區是綠色，紅點在上面最跳，也跟打擊姿態的紅球同一個顏色。
顏色只用 Tailwind 內建色盤（`neutral`、`green`、`red`），不用 Nuxt UI 的 `primary`：新專案只要有 Tailwind 就畫得出來。
標籤預設放在點的右上方，估字寬後右邊放不下換左邊，兩邊都放不下（手機上字相對大）就置中在點的正上方；
標籤、本壘與中外野字都有一圈底色描邊，壓在距離弧或灰點上仍讀得清楚。

### 手機上的字級

SVG 單位是公尺，整張圖在手機上只有兩百多像素寬時，4 單位的字只剩約 6px。元件用 `ResizeObserver` 量實際渲染寬度，
把字級、點的大小與點擊範圍換算回 SVG 單位後跟設計值取大者：輔助文字至少 11px（距離弧刻度 10px）、落點標籤至少 12px、
灰點的點擊範圍半徑至少 11px（`MIN_TEXT_PX`／`MIN_LABEL_PX`／`MIN_HIT_RADIUS_PX`）。SSR 與還沒量到寬度時用設計值。

元件本身**不依賴 bpe-data**：從 `RawBpePayload.predicted_landing_point_m`（`[x, y, z]`，公尺）到
`{ x, y }` 的轉換由呼叫端（showcase）做，`z` 落地時恆為 0，本來就不使用。

## 座標與版面方向

沿用規範第 1 節的座標系：原點本壘板尖端，+x 一壘方向，+y 中外野方向，單位**公尺**（`predicted_landing_point_m`
是 payload 裡唯一以公尺為單位的欄位，直接取 `[0]`／`[1]`，不換算、不用 `[2]`）。

版面採標準俯視方向（本壘在下、中外野在上、一壘側在右），與 `spec/domain/baseball-field-coordinates.md`
§6「俯視圖方向」一致。**SVG 單位直接等於 1 公尺**（`svgY = viewport.yMax − y`），橫縱共用同一個縮放比例，
球場不會被拉扁——手法與 `pitch-distribution`「SVG 單位 = 1cm」相同，只是這裡單位換成公尺。

## 球場邊界公式 vs. 裝飾

兩者的差別是「照規範算」還是「純粹好讀」，混在一起會讓人以為距離弧也是量測資料：

| 類別 | 內容 | 能不能關 |
|------|------|----------|
| **邊界（規範公式）** | 界外線 `y = abs(x)`（`abs(x) ≤ 72.125`）、外野弧 `y = 44.912 + √(77.088² − x²)`（`−72.125 ≤ x ≤ 72.125`），兩者在 `(±72.125, 72.125)` 相接（邊線 102 m、中外野 122 m） | 不行，`showDecorations` 只管裝飾 |
| **裝飾** | 30／60／90 m 距離弧（只畫界內段）、內野菱形（壘間 27.431 m）、投手板點 | `showDecorations` 控制，顏色比邊界淡 |

距離弧不畫 120 m：圍牆本身就是 102～122 m 的距離參考，120 m 弧大半落在圍牆外，
兩端還會超出預設視野被裁斷（參考實作多畫了一圈 120 m，是因為它的視野更寬）。

外野弧用**折線**而非 SVG `arc` 指令：`toSvg` 會翻轉 y 軸，`arc` 的 sweep-flag 翻轉後方向不直覺，
折線直接沿用同一個 `toSvg` 轉換不會算錯，取樣夠密（預設每 2 m 一點）肉眼看不出差異。
兩端點強制對齊公式算出的值，不受步進誤差影響，`core/fieldChart.spec.ts` 驗證了這點與 `x=0 → 122`。

## 視野決策

預設視野固定 x ∈ [−80, 80]、y ∈ [−10, 128]（公尺），包住整個球場並留邊，**視野不隨資料變動**——
切換事件時圖不會跳動，不同球才能直接比位置（做法與 `pitch-distribution` 的固定視野同一個理由）。

23 筆樣本裡只有事件 #11 的落點（本壘後方 y = −59.458 m）超出這個範圍。落點在視野外時，
**照座標畫，不 clamp、不判斷界內外**——把視野擴大到剛好包住該點，再留 8 m 邊。
`computeFieldViewport()` 回傳的 `expanded` 旗標讓呼叫端知道發生了這件事，可以在畫面上多講一句解釋
（本模組的 showcase 在畫布上方加一個標籤）。其他事件的灰點不影響視野：選別的事件時 #11 落在視野外，
不畫出來，showcase 的圖例會寫「1 筆在目前視野外」。

## 搬移要一併帶走

元件零外部相依，只用 `vue`（`ref`／`computed`），整包 `cp` 這個資料夾就能在別的專案跑。

Showcase（`app/components/modules/LandingFieldChartShowcase.vue`）另外需要：

- `app/components/bpe-data/`（BPE 結果的解析與 13 項數值）
- `app/composables/useBpeEvents.ts`（樣本載入）、`useBpeOverview.ts`（全部事件疊圖）、`useBpeEventStepper.ts`（上一筆／下一筆與 ← →）、`useLightCanvas.ts`（淺色畫布開關）
- `app/components/modules/BpeMetricList.vue`（數值面板）

## 已知限制

1. 球場邊界公式是規範給的固定尺寸（邊線 102 m、中外野 122 m），代表的是規範定義的標準球場，
   不代表龍潭實際場地的量測結果。
2. showcase 顯示的「預測飛行距離」（`metrics.distance`）只用擊球初速與出射角推算，
   不含球的旋轉（Magnus 力）與空氣阻力，只能當粗估參考（出處：團隊內部研究筆記「擊球數據研究」）。
3. 事件 #11（y = −59.5 m）與事件 #3（y = −3.5 m）的落點都在本壘後方，數值合理性待演算法端確認；
   #11 因超出預設視野需要擴大顯示，#3 在預設視野內。
4. 23 筆樣本的 `notes` 都標註 `awaiting project-owner visual review`，數值尚未經人工確認，
   本模組一律照座標畫，不做合理性過濾。
5. 擊球方向（`exit_direction`）的正負規範沒有定義。showcase 把正值寫成「一壘側」是從樣本推定的：
   有落點的 17 筆裡 16 筆方向與落點 x 同號，例外的事件 #20 落點 x = −0.11 m、幾乎在正中。
   方向角也不等於「本壘到落點」的方位角（事件 #16 差到 37°），兩者不能互相代替。
6. 有 8 筆落點擠在本壘 10 m 內，灰點互相重疊，點下去選到的是最上面那一筆；要選特定一筆用事件選單或上一筆／下一筆。
