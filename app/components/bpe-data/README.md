# bpe-data — BPE 揮棒結果的資料層

> **渲染器無關**，零 npm 依賴（連 `vue` 都不用）。
> 打擊姿態（`batter-pose/`）、擊球點九宮格（`contact-point-grid/`）、預測落點球場圖（`landing-field-chart/`）三個模組都吃這一份。

## 為什麼獨立成一個資料夾

演算法端的一筆 BPE 結果檔同時餵四項畫面（3D 動畫、九宮格擊球點、球場落點、13 項數值）。
檢查關卡與缺值規則若寫在各模組裡，三份遲早會分岔——例如一邊把 `value: null` 當 0 畫、
另一邊不顯示。集中在這裡之後：

- **規則只寫一次**：`status` 檢查、缺值判定、座標有效性都在 `parseBpeResult()`
- **要哪個模組就搬哪個資料夾 + 這個**：三個模組彼此不相依，只相依本資料層
- **13 項數值的歸屬是資料層決定的**：`SWING_METRIC_KEYS`／`CONTACT_METRIC_KEYS`／`FLIGHT_METRIC_KEYS`
  三組合起來剛好 13 項，測試保證不漏不重

## 檔案

| 檔案 | 責任 |
|------|------|
| `core/types.ts` | 原檔（wire）型別、解析後型別、13 項數值定義與三模組分組 |
| `core/parseBpeResult.ts` | 檢查關卡、缺值規則、骨頭分類（人體／球棒）、擊球幀、播放時鐘查幀 |
| `core/format.ts` | 數值與單位的顯示寫法、擊球方向的偏向寫法、判定結果中文、事件編號拆解、事件選單標籤 |

樣本（`public/samples/bpe/`，`scripts/import-bpe-samples.mjs` 產生）除了 `index.json` 與逐筆 `events/`，
還有一份 `overview.json`：同一批結果只拿掉 payload 的 `skeleton` 與 `animation`（23 筆約 33KB），
擊球點九宮格把全部事件疊在同一張圖上時讀它（`app/composables/useBpeOverview.ts`），每筆照樣過 `parseBpeResult()`；球場圖元件也支援疊圖，但 showcase 目前沒有用。

兩支 `.spec.ts` 都有合成資料的邊界案例；`parseBpeResult.spec.ts` 另用 `public/samples/bpe/` 的 23 筆真實樣本
核對交接報告的逐筆數字（四類分布 14／1／2／6、事件 #20 無擊球點有落點、球體幀數等），樣本不在時自動跳過。

## 資料合約重點

規則的唯一真理來源是演算法端的 `frontend-render-guide.md`（2026-09-07 參考包）。以下只列實作時最容易錯的：

| 項目 | 規則 | 本層的做法 |
|------|------|-----------|
| 檢查關卡 | `status === "success"` 且 `payload` 存在才繪製 | 回傳 `{ ok: false, status, errorText }`，呼叫端四項都不畫 |
| 單位 | `*_cm` 是公分，`predicted_landing_point_m` 是公尺 | 型別註解標明，不做換算 |
| 座標系 | 原點本壘板尖端，+x 一壘、+y 投手、+z 向上 | 與 `spec/domain/baseball-field-coordinates.md` 相同，**不做任何轉換** |
| 骨架 | 19 點（COCO-17 + `bat_knob` + `bat_head`），20 條骨頭 | 從檔案讀 `joint_names` 與 `bones`；球棒以名稱 `bat_*` 判定，不寫死索引 |
| 整幀缺 | `joints_cm` 仍是長度 19 的陣列，每格 `null` | 照樣保留該幀（時間軸不跳格），每格 `null` |
| 球缺 | `ball_cm: null`；2.0.0 舊檔沒有這個欄位 | 都是 `ball: null`；另以 `hasBallField` 區分舊檔 |
| 數值缺 | metric 物件仍在，只有 `value` 是 `null` | 該項不出現在 `metrics`，不補 0 |
| 四項獨立 | 沒有擊球點不代表沒有落點 | `contact`、`landingM`、`swing`、`metrics` 各自判斷 |

座標不轉換的理由：規範第 1 節給了 three.js（y-up）的換算式，但本 repo 的 `scene3d` 相機本來就是 z-up，
直接吃資料原生座標。多轉一次只會讓每個模組都得記一次換算規則。

## 播放相關

- `frameAtTime(frames, t)`：最後一個 `time_s ≤ t` 的幀（二分搜尋）。依規範「以 `time_s` 對真實時間對齊」，
  原檔缺 `sample_period_s` 時仍可播放
- 缺 `time_s` 的幀放不上時間軸，整幀略過。代價是之後的幀索引會往前移一格，拖尾「往前數 19 幀」的時間窗
  會因此多涵蓋一幀。23 筆樣本每幀都有 `time_s`，目前不會發生；規範也沒定義這種情況，遇到時先問演算法端
- `contactFrame`：`time_s` 最接近 `contact.time_s` 的幀。沒有擊球點時為 `null`，呼叫端要停用「跳至擊球」
- `trigger_time_s` 規範明示前端不用，本層不讀

## 顯示格式

- 兩種寫法（`core/format.ts`）：
  - `formatMetric`：**原樣顯示、不四捨五入**。小數位數不固定（1～3 位），且 23 筆的 `notes` 都標註
    `awaiting project-owner visual review`，要看精確值時一律用它
  - `formatMetricBrief`：卡片與畫布上的精簡寫法，一位小數；不到 1 秒的時間改毫秒（0.236 s → 236 ms），
    1 秒以上留在秒（滯空 2.82 s → 2.8 s），方便一眼讀。
    只是顯示，旁邊的提示一定附上原始值（`BpeMetricList` 滑鼠停在卡片上就看得到欄位名稱與原始值）
- 單位取資料的 `unit` 欄位；`degree` 顯示成 `°`，其他原樣。`unit` 缺少時不拿規範表補，只顯示數字
- 負號換成 Unicode 減號（U+2212）
- 擊球方向另用 `formatExitDirectionBrief`：講偏哪一邊、角度取絕對值（2.9 → 「一壘側 2.9°」，−35.64 → 「三壘側 35.6°」，
  四捨五入後是 0 寫「正中 0.0°」）。正負代表哪一邊是推定，見下方待確認第 5 點
- 判定結果用 `outcomeLabel` 換中文（hit → 擊中、uncertain → 判定不確定），表上沒有的值原樣顯示

## 未寫進規範、待演算法端確認

1. 品質欄位（`landing`、`contact_status`、quality_flags）只在 `index.json`，payload 沒有、意義也沒寫。
   本層只拿 `index.json` 排事件選單，不據以決定畫不畫
2. 事件 #0–#9 與 #10–#22 用了兩個不同的 checkpoint
3. 有擊球點的 14 筆 `contact.time_s` 與 `trigger_time_s` 完全相等；無擊球點時 `trigger_time_s` 仍有值
4. BPE 的全稱沒有提供
5. `exit_direction` 的正負代表哪一邊沒有定義。畫面寫成「正值＝一壘側」是從樣本推定：有落點的 17 筆裡 16 筆與落點 x 同號，
   例外的事件 #20 落點 x = −0.11 m。方向角也不等於本壘到落點的方位角（事件 #16 差 37°）

異常值（照規範照畫，但數值合理性待確認）見三個模組 README 的「已知限制」。
