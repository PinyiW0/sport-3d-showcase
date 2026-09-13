# 擊球點九宮格

把一筆 BPE 結果的擊球點（`contact.point_cm`）畫在好球帶九宮格上：看的人要一眼看出球棒在哪裡碰到球——相對好球帶偏左右多少、多高。純 SVG，無第三方繪圖庫。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `ContactPointGrid.vue` | SVG 渲染：地面線、本壘板正視窄帶、刻度、好球帶九宮格、擊球點與輔助線 |
| `core/contactGridScale.ts` | 座標轉換、固定視野與超界擴大、九宮格幾何（純 TS + vue 的 computed，有單元測試） |
| `app/components/baseball-field/core/fieldGeometry.ts` | **外部依賴**：好球帶邊界型別 `StrikeZoneBounds`、本壘板常數 `HOME_PLATE`、球半徑 `BALL_RADIUS`。整包 cp 時要一併帶走 |
| `app/components/modules/ContactPointGridShowcase.vue` | 消費端 showcase：接 BPE 樣本、打者級別選單、輔助線開關（可用 NuxtUI，不隨模組搬走） |

## 用法

```vue
<ContactPointGrid :zone="zone" :point="{ x: 10.2, z: 78.4 }" />
```

| Prop | 型別 | 預設 | 說明 |
|------|------|------|------|
| `zone` | `StrikeZoneBounds` | 必填 | 好球帶邊界（cm），由呼叫端依打者級別或實際身高算好再傳入；元件不自己決定 |
| `point` | `{ x: number, z: number } \| null` | 必填 | 擊球點；`null` 表示這筆結果沒有擊球點，依規範不畫點 |
| `pointRadius` | `number` | `BALL_RADIUS`（3.65） | 擊球點半徑（cm）。SVG 單位即 cm，預設值就是真實球的大小 |
| `showGuides` | `boolean` | `true` | 擊球點到兩軸的虛線輔助線 |

元件本身只吃 `zone` 與 `x`／`z` 數字，不依賴 `bpe-data`——換任何資料來源都能用。BPE 結果 → props 的轉換（只取 `point_cm[0]`／`[2]`、忽略 `[1]`）在 showcase 做。

## 座標與視角

**捕手視角、+x 在畫面右側**，只用 `point_cm` 的 x（水平）與 z（高度），忽略 y——等同把九宮格平面移到擊球點所在的 y 位置。不判斷內外角、不管左右打，直接照 x／z 落點畫。

> **與 `strike-zone-grid` 的差異**：`strike-zone-grid/core/useStrikeZoneScale.ts` 刻意把 x 軸反轉（`toSvg` 用 `xMax − px`），是為了對齊後端 2D 落點圖 renderer 的畫面慣例。本模組**不反轉**，因為 BPE 規範（`frontend-render-guide.md` §3）明定「捕手視角，+x 為一壘方向、畫面右側」，這才是業界慣例本身（見 `spec/domain/baseball-field-coordinates.md` §6 的警告框）。兩個模組看起來都叫「捕手視角」，但左右是相反畫法，共用程式碼前務必先確認這一點。

好球帶不在 BPE 結果裡，由呼叫端依打者級別（或實際身高）用 `baseball-field/core/batterLevels.ts` 的 `getStrikeZoneForLevel()` 推算後再傳入 `zone` prop。左右恆為本壘板半寬 ±21.59 cm，不隨級別變動；上下隨代表身高變動。

## 視野決策

預設固定 **x ∈ [−75, 75]、z ∈ [0, 200]（cm）**。23 筆樣本的擊球點 x 在 −21.9～40.9、z 在 15.2～168.0，全都裝得下且不會觸發擴大——固定視野讓不同事件的擊球點可以直接比位置，不會因為單一事件的落點而跳動縮放。

擊球點落在預設視野外時（目前樣本沒有，但未來資料可能有），依規範「照座標畫，不裁切」（`baseball-field-coordinates.md` §9「不要只做 clamp」）：把視野擴大到剛好包住該點，再留 15 cm 邊。`core/contactGridScale.ts` 回傳的 `expanded` 旗標讓外面知道視野已經改變；showcase 用它在資訊列多補一句提示。

**取捨**：`core/contactGridScale.ts` 回傳的 `viewWidth`／`viewHeight` 就是資料視野本身（預設 150 × 200），不含任何邊距。左側 z 刻度、下方 x 刻度與方位字需要的畫布邊距（`ContactPointGrid.vue` 內的 `PAD` 常數）刻意留在元件裡處理，不混進 core——這樣 `useContactGridScale` 的回傳值測起來單純（1 個 SVG 單位就是 1 cm 資料座標，沒有額外偏移要扣），邊距純屬這個元件自己的排版決定，換一種畫面呈現不需要改 core。

## 搬移要一併帶走

- `app/components/baseball-field/`（場地與好球帶常數的單一來源，`ContactPointGrid.vue` 與 `core/contactGridScale.ts` 都直接 import）
- showcase 額外需要：`app/components/bpe-data/`、`app/composables/useBpeEvents.ts`、`app/components/modules/BpeMetricList.vue`（純元件本身不需要這三項）

## 已知限制

- 好球帶用打者級別的代表身高推算（`baseball-field/core/batterLevels.ts`），BPE 結果本身不含打者身高，無法用實際身高算出更準的好球帶。
- 擊球點高度異常值：事件 #5、#7、#11 的 `contact_height` 分別為 132.8、168.0、143.2 cm，高於一般好球帶上緣（成棒約 92 cm）。規範要求「照座標畫」，畫面上不做任何過濾或修正，但數值本身是否合理待演算法端確認。
- `contact_side`／`contact_height` 的定義暫定與 Trackman 的 `ContactPosition` 相同（出處：團隊內部研究筆記「擊球數據研究」），演算法端尚未正式定義這兩個欄位的量測基準。
- 23 筆樣本的 `notes` 都標註 `awaiting project-owner visual review`，數值未經人工確認；9 筆事件的 `contact` 為 `null`（無擊球點），依規範不畫。
