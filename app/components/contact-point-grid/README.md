# 擊球點九宮格

把一筆 BPE 結果的擊球點（`contact.point_cm`）畫在好球帶九宮格上：看的人要一眼看出球棒在哪裡碰到球——相對好球帶偏左右多少、多高。純 SVG，無第三方繪圖庫。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `ContactPointGrid.vue` | SVG 渲染：地面線、本壘板正視窄帶、刻度、好球帶九宮格與格號、擊球點與輔助線、其他事件的灰點；簡約版改畫本壘板與打擊區示意 |
| `core/contactGridScale.ts` | 座標轉換、固定視野（原版與簡約版各一套）與超界擴大、九宮格幾何（純 TS + vue 的 computed，有單元測試） |
| `app/components/baseball-field/core/fieldGeometry.ts` | **外部依賴**：好球帶邊界型別 `StrikeZoneBounds`、本壘板常數 `HOME_PLATE`、球半徑 `BALL_RADIUS`。整包 cp 時要一併帶走 |
| `app/components/modules/ContactPointGridShowcase.vue` | 消費端 showcase：接 BPE 樣本、事件選單與上一筆／下一筆、打者級別選單、簡約呈現／輔助線／淺色畫布開關、畫布標籤與圖例、數值面板（可用 NuxtUI，不隨模組搬走） |

## 用法

```vue
<ContactPointGrid
  :zone="zone"
  :point="{ x: 10.2, z: 78.4 }"
  :others="[{ id: 4, x: -21.9, z: 57.9, label: '事件 #4' }]"
  @select="id => (selected = id)"
/>
```

| Prop | 型別 | 預設 | 說明 |
|------|------|------|------|
| `zone` | `StrikeZoneBounds` | 必填 | 好球帶邊界（cm），由呼叫端依打者級別或實際身高算好再傳入；元件不自己決定 |
| `point` | `{ x: number, z: number } \| null` | 必填 | 擊球點；`null` 表示這筆結果沒有擊球點，依規範不畫點 |
| `pointRadius` | `number` | `BALL_RADIUS`（3.65） | 擊球點半徑（cm）。SVG 單位即 cm，預設值就是真實球的大小 |
| `schematic` | `boolean` | `false` | 簡約呈現：視野縮到好球帶附近，拿掉地面線、刻度、方位字與點旁標籤，改畫捕手視角的本壘板（尖端朝上）與左右打擊區示意，格號放大。座標只留在滑鼠提示（`pointTitle`） |
| `showGuides` | `boolean` | `true` | 擊球點到兩軸的虛線輔助線；簡約版沒有座標軸，一律不畫 |
| `dark` | `boolean` | `false` | 深色配色。不跟頁面 colorMode 走；SVG 本身透明，底色由呼叫端鋪（淺色配 `neutral-100`、深色配 `neutral-900`，擊球點與文字的描邊就是這兩個底色） |
| `others` | `ContactGridMarker[]` | `[]` | 其他事件的擊球點（`id`、`x`、`z`、選填 `label`），畫成淡灰小點、可點選。視野只依 `point` 決定，灰點不讓視野擴大，落在視野外的不畫——呼叫端要提示筆數可用 `core/contactGridScale.ts` 的 `isInView` 自己算 |
| `pointTitle` | `string` | 點旁標籤 | 擊球點的滑鼠提示，showcase 放原始座標（含不使用的 y） |

| 事件 | 參數 | 說明 |
|------|------|------|
| `select` | `id: number` | 點選（或 Tab 到灰點按 Enter／空白鍵）其他事件的灰點時發出，帶回該點的 `id` |

點旁標籤一律一位小數（`x 0.5 · z 49.0 cm`），精確值放 `pointTitle`。標籤先放點的右邊，估字寬後右邊放不下才換左邊；標籤與沒有擊球點的提示字都有一圈底色描邊，壓在格線上仍讀得清楚。

### 原版與簡約版

| | 原版（預設） | 簡約版（`schematic`） |
|---|---|---|
| 給誰看 | 要讀數字的人：刻度、方位字、點旁座標都在 | 只想看「打在框的哪裡」的人 |
| 視野 | x ±75、z 0～200 cm | x ±48、z −30 cm～好球帶上緣 +15 cm（見「視野決策」） |
| 框下方 | 地面線與本壘板正視窄帶 | 本壘板五角形（尖端朝上）與左右打擊區線條，只是示意 |
| 擊球點 | 點 + 點旁標籤 + 輔助線 | 只有點，座標在滑鼠提示 |
| 畫布邊距 | 跟著字級走（放刻度字） | 四邊固定 6 cm（沒有刻度字） |

showcase 的「簡約呈現」開關預設關閉；打開時「輔助線」開關會停用，因為簡約版不畫輔助線。

### 手機上的字級

SVG 單位跟著 viewBox 縮放，圖塞進手機窄欄時照比例算的字會小到讀不了。元件用 `ResizeObserver` 量實際渲染寬度，把字級與點擊範圍換算回 SVG 單位後跟設計值取大者：輔助文字至少 11px（格號 10px；簡約版格號的設計值放大到輔助文字的 1.1 倍）、點旁標籤至少 12px、灰點的點擊範圍半徑至少 11px（`MIN_TEXT_PX`／`MIN_LABEL_PX`／`MIN_HIT_RADIUS_PX`）。SSR 與還沒量到寬度時用設計值。

顏色只用 Tailwind 內建色盤（`neutral`、`green`、`white`），不用 Nuxt UI 的 `primary`：新專案只要有 Tailwind 就畫得出來，不需要 Nuxt UI。

元件本身只吃 `zone` 與 `x`／`z` 數字，不依賴 `bpe-data`——換任何資料來源都能用。BPE 結果 → props 的轉換（只取 `point_cm[0]`／`[2]`、忽略 `[1]`）在 showcase 做。

## 座標與視角

**捕手視角、+x 在畫面右側**，只用 `point_cm` 的 x（水平）與 z（高度），忽略 y——等同把九宮格平面移到擊球點所在的 y 位置。不判斷內外角、不管左右打，直接照 x／z 落點畫。

> **與 `strike-zone-grid` 的差異**：`strike-zone-grid/core/useStrikeZoneScale.ts` 刻意把 x 軸反轉（`toSvg` 用 `xMax − px`），是為了對齊後端 2D 落點圖 renderer 的畫面慣例。本模組**不反轉**，因為 BPE 規範（`frontend-render-guide.md` §3）明定「捕手視角，+x 為一壘方向、畫面右側」，這才是業界慣例本身（見 `spec/domain/baseball-field-coordinates.md` §6 的警告框）。兩個模組看起來都叫「捕手視角」，但左右是相反畫法，共用程式碼前務必先確認這一點。

好球帶不在 BPE 結果裡，由呼叫端依打者級別（或實際身高）用 `baseball-field/core/batterLevels.ts` 的 `getStrikeZoneForLevel()` 推算後再傳入 `zone` prop。左右恆為本壘板半寬 ±21.59 cm，不隨級別變動；上下隨代表身高變動。

## 視野決策

原版預設固定 **x ∈ [−75, 75]、z ∈ [0, 200]（cm）**。23 筆樣本的擊球點 x 在 −21.9～40.9、z 在 15.2～168.0，全都裝得下且不會觸發擴大——固定視野讓不同事件的擊球點可以直接比位置，不會因為單一事件的落點而跳動縮放。

**簡約版**的視野換一套：x 取「好球帶左右各外推 25 cm」與「±48 cm」的較寬者（本壘板寬固定，所以恆為 ±48），z 從 −30 cm（留給本壘板與打擊區示意）到好球帶上緣 +15 cm，上緣隨打者級別變。視野小很多：成棒時 23 筆裡事件 #5、#7、#11、#14、#18 的擊球點落在視野外，切到這幾筆會擴大視野並顯示「已自動擴大」標籤。

擊球點落在預設視野外時（原版的樣本沒有，但未來資料可能有），依規範「照座標畫，不裁切」（`baseball-field-coordinates.md` §9「不要只做 clamp」）：把視野擴大到剛好包住該點，再留 15 cm 邊。`core/contactGridScale.ts` 回傳的 `expanded` 旗標讓外面知道視野已經改變；showcase 用它在畫布上方加一個「已自動擴大」標籤。

**取捨**：`core/contactGridScale.ts` 回傳的 `viewWidth`／`viewHeight` 就是資料視野本身（預設 150 × 200），不含任何邊距。左側 z 刻度、下方 x 刻度與方位字需要的畫布邊距（`ContactPointGrid.vue` 內的 `PAD` 常數）刻意留在元件裡處理，不混進 core——這樣 `useContactGridScale` 的回傳值測起來單純（1 個 SVG 單位就是 1 cm 資料座標，沒有額外偏移要扣），邊距純屬這個元件自己的排版決定，換一種畫面呈現不需要改 core。簡約版沒有刻度字，邊距固定四邊 6 cm。

## 搬移要一併帶走

- `app/components/baseball-field/`（場地與好球帶常數的單一來源，`ContactPointGrid.vue` 與 `core/contactGridScale.ts` 都直接 import）
- showcase 額外需要：`app/components/bpe-data/`、`app/composables/useBpeEvents.ts`、`useBpeOverview.ts`（全部事件疊圖）、`useBpeEventStepper.ts`（上一筆／下一筆與 ← →）、`useLightCanvas.ts`（淺色畫布開關）、`app/components/modules/BpeMetricList.vue`（純元件本身都不需要）

## 已知限制

- 好球帶用打者級別的代表身高推算（`baseball-field/core/batterLevels.ts`），BPE 結果本身不含打者身高，無法用實際身高算出更準的好球帶。
- 擊球點高度異常值：事件 #5、#7、#11 的 `contact_height` 分別為 132.8、168.0、143.2 cm，高於一般好球帶上緣（成棒約 92 cm）。規範要求「照座標畫」，畫面上不做任何過濾或修正，但數值本身是否合理待演算法端確認。
- `contact_side`／`contact_height` 的定義暫定與 Trackman 的 `ContactPosition` 相同（出處：團隊內部研究筆記「擊球數據研究」），演算法端尚未正式定義這兩個欄位的量測基準。
- 23 筆樣本的 `notes` 都標註 `awaiting project-owner visual review`，數值未經人工確認；9 筆事件的 `contact` 為 `null`（無擊球點），依規範不畫。
