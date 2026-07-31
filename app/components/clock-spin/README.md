# 時鐘轉軸（`/clock-demo`）

> 盤面與指針抽成獨立元件，數學未改動。

把 `spin_tilt` 以 2D 時鐘面板呈現：盤面是靜態 SVG，指針整組繞中心旋轉 `spin_tilt.degrees`。
與 `baseball-spin` 的 3D 轉軸指針是同一份資料的兩種呈現，可在 `/clock-demo` 並排對照。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `app/components/clock-spin/SpinTiltClock.vue` | 模組唯一對外元件（純 SVG，無 3D 函式庫） |
| `app/components/clock-spin/core/clock-geometry.ts` | 12 個時鐘數字的座標計算（純 TS，有單元測試） |
| `app/pages/clock-demo.vue` | 驗證頁：2D 時鐘與 3D 指針並排 |
| `public/samples/spin/sample{1..3}/result.json` | 樣本（與 baseball-spin 共用同一批） |

## 實作方式

盤面用 `viewBox="0 0 200 200"`、中心固定 (100, 100)：

| 元素 | 幾何 |
|------|------|
| 外圈 | `circle r=84`，`#E5E5E5` |
| 數字環 | `r=75`，12 點在正上方（SVG rotate 順時針，故角度 = `num/12×360 − 90`） |
| 內圈 | `circle r=62`，白底 |
| 十字參考線 | `#D4D4D4`，opacity 0.6 |
| 指針 | 5 個 chevron `polyline`，points 為 `90,cy 100,cy−16 110,cy`，`cy ∈ {68, 88, 108, 128, 148}`；整組套 `rotate(degrees 100 100)` |

### 兩種指針樣式（`pointer` prop）

| 值 | 樣式 | 畫法 |
|----|------|------|
| `chevron`（預設） | 5 個 V 形沿軸排列 | `polyline` ×5，`stroke-width=6`、`fill=none` |
| `arrow` | 單一實心箭頭 | `line` + `polygon` 箭頭，另加 drop-shadow |

兩者盤面幾何完全相同，只差指針畫法；chevron 較能看出「軸」的走向，arrow 指向較明確。
`/clock-demo` 兩種並排、展示頁可即時切換。

## 指針怎麼運轉

### 資料鏈路

```
後端 result.json
  └─ spin_tilt: { hhmm: "01:47", degrees: 233.78 }     ← 只取這個 key，spin_dir 不使用
       ↓ parseSpinResult()（baseball-spin/core/types.ts，Zod 驗證 + snake_case → camelCase）
     spinTilt: { hhmm, degrees }
       ↓ 呼叫端把兩個值拆成 props
     <SpinTiltClock :degrees="spinTilt.degrees" :hhmm="spinTilt.hhmm" />
       ↓ degrees 原封不動組成 transform 字串（不取模、不加減、無任何換算）
     <g transform="rotate(233.78 100 100)">…指針…</g>
```

### 旋轉規則

1. **靜止姿態**：指針在未旋轉時指向**正上方（12 點）**。SVG 的 y 軸向下，所以指針的幾何點位
   （`cy` 68→148、chevron 尖端在 `cy−16`）都在中心上方，尖端朝 y 較小的方向。
2. **旋轉中心**：盤面正中心 `(100, 100)`，與外圈、內圈、數字環同心。
3. **旋轉方向**：SVG `rotate()` 的正值是**順時針**，與時鐘走向一致。所以 `degrees` 每增加 30°，
   指針就往前一個鐘點。
4. **旋轉量**：直接等於 `spin_tilt.degrees`，元件內不做任何調整。

由此可反推指針最後指向鐘面幾點：

```
指針時刻（小時） = (degrees mod 360) ÷ 360 × 12
```

### 走一遍實際數字（sample1）

```
spin_tilt.degrees = 233.78
  → 233.78 mod 360 = 233.78
  → 233.78 ÷ 360 × 12 = 7.796 小時 = 07:48   ← 指針實際指的位置
spin_tilt.hhmm    = "01:47"                   ← 標籤顯示的值
```

指針指 **07:48**、標籤寫 **01:47**，相差約 6 小時（180°）——就是下一節說的那件事。
不是剛好 6 小時，因為實測 `degrees` 比 hhmm 的盤面角度多的是 180.28° 而非整數 180°。

三個樣本的實際換算：

| 樣本 | `degrees` | mod 360 | 指針指向 | 標籤 `hhmm` |
|------|-----------|---------|----------|-------------|
| sample1 | 233.78 | 233.78 | 07:48 | 01:47 |
| sample2 | 217.26 | 217.26 | 07:15 | 01:14 |
| sample3 | 442.15 | 82.15 | 02:44 | 08:44 |

## 資料慣例（實測三個樣本）

| 觀察 | sample1 | sample2 | sample3 |
|------|---------|---------|---------|
| `spin_tilt` hhmm | 01:47 | 01:14 | 08:44 |
| `spin_tilt.degrees` | 233.78 | 217.26 | 442.15 |
| hhmm 對應的盤面角度 | 53.50 | 37.00 | 262.00 |
| **degrees − 盤面角度** | **180.28** | **180.26** | **180.15** |
| `spin_dir` 與 `spin_tilt` 的 hhmm 差 | 3 小時 | 3 小時 | 3 小時 |

兩件搬用時要知道的事：

1. **`degrees` 比自己的 `hhmm` 多約 180°** —— 直接 `rotate(degrees)` 時，箭頭指的是標籤時刻的**對側**。
   轉軸本身是一條雙向的線，兩端都成立；這是既有行為，原樣保留、未改數學。
   若要讓箭頭與標籤同側，在呼叫端傳 `degrees - 180` 即可，不需改元件。
2. **後端的 `degrees` 未正規化到 0–360** —— 本批樣本出現 `442.15` 與 `-7.85`。
   SVG `rotate()` 吃任意角度，所以呈現無誤；但若要拿這個值做比較或分類，記得先取模。

## 資料來源需要的欄位

後端 `result.json` 只有 `spin_tilt` 這一個 key 會被用到（`spin_dir`、`axis`、`animation` 皆不使用）：

| wire 欄位 | 元件 prop | 型別 | 必要 | 用途 |
|-----------|-----------|------|------|------|
| `spin_tilt.degrees` | `degrees` | `number` | ✅ | 指針的旋轉量，直接進 `rotate()` |
| `spin_tilt.hhmm` | `hhmm` | `string` | — | 標籤列顯示；不給就整條標籤列不渲染 |
| — | `pointer` | `'chevron' \| 'arrow'` | — | 指針樣式，預設 `chevron` |
| — | `label` | `string` | — | 標籤列文字，預設「轉軸方向」 |

`degrees` 與 `hhmm` 之間沒有互相推導——兩個值都由後端各自給定，元件只是分別拿來旋轉與顯示。
盤面其餘部分（外圈、數字、內圈、十字線）全是前端常數，不吃任何資料。
