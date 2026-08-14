# 投手姿態交付包（2026-08-14）

演算法端交付的單球投手姿態分析結果，原始包放在 `doc/投手姿態frame/`（13 檔、124 MB，**已 gitignore**：內含三機 mp4 與內嵌影片的 Plotly HTML，單檔逼近 GitHub 100 MB 上限）。本檔記錄包裡有什麼、欄位怎麼定義、以及尚未對齊的合約落差。

前端實際使用的樣本已抽出到 `public/samples/pose-metrics/biomech.json`（原樣複製，未改欄位）。

## 這一顆球

`pitch_20260624_152505.265147_2a4264` — 右投、748 影格、約 250 fps、總長 2.992 秒。

三個事件：leg_lift 在 frame 211、foot_plant 在 frame 608、release 在 frame 637。

> 注意這**不是** `public/samples/pose3d/outcome.json` 那顆球（`...152029`，左投）。兩個模組目前用不同的球，無法互相對照。

## 包內檔案

| 檔案 | 大小 | 內容 | 前端是否使用 |
|---|---|---|---|
| `pitch_*_biomech.json` | 155 KB | 逐影格生物力學：`timeseries` / `events` / `peak` / `at_release` / `at_foot_plant` | ✅ 已抽進 `public/samples/pose-metrics/` |
| `pitch_*.xlsx` | 137 KB | 同一份資料的 Excel 版，三個工作表 `frame_angles` / `summary` / `release_metrics` | ❌ 對照用（欄位比 JSON 多，見下） |
| `outcome.json` | 18 MB | 3D 骨架，格式同專案既有的 pose3d 樣本，但多了每點的 `quality` / `outlier_rejected` / `smoothed` / `interpolated` 旗標與三機 2D 偵測結果 | ❌ 本次未用 |
| `release_entry.json` | 752 B | 出手點偵測結果（球與手腕的 3D 座標、判定方法） | ❌ 內容已含在 biomech 的 `release` |
| `pitch_*_{1B,3B,HB}.frames.json` | 各 19 KB | 三台相機各自的影格時間戳陣列（各 750 筆） | ❌ 影片對齊用 |
| `pitch_*_{1B,3B,HB}.mp4` | 共 63 MB | 三機原始影片 | ❌ |
| `pitch_4panel.html` | 36 MB | 三機影片 + 3D pose 的四格對照（Plotly，影片以 base64 內嵌） | ❌ 參考用 |
| `release_3d_pose.html` / `.mp4` | 8.2 MB | 出手瞬間的 3D pose 動畫（Plotly v3.6.0） | ❌ 參考用 |

## biomech.json 欄位

`schema_version: 6`。單位定義在 `units`：角度 degree、距離 cm、力矩 N*m、時間戳 UTC ISO-8601。

### timeseries（7 條，各 748 點，可含 null）

| 欄位 | null 數 | 值域 | 備註 |
|---|---|---|---|
| `shoulder_external_rotation_angle` | 146 | -90.26 ~ 166.60 | |
| `lead_knee_flexion` | 80 | 0.99 ~ 113.84 | |
| `trunk_rotation` | 19 | -178.66 ~ 179.75 | ±180 環繞角 |
| `trunk_anterior_tilt` | 91 | -29.16 ~ 27.90 | |
| `pelvis_rotation` | 81 | -176.66 ~ 179.28 | ±180 環繞角 |
| `elbow_flexion_angle` | 66 | 11.37 ~ 140.84 | |
| `shoulder_internal_rotation_angle` | 301 | 0.01 ~ 90.26 | 衍生欄位，見下 |

另有 `timestamp: string[748]`。`events` 三個事件的 `timestamp` 與 `timeseries.timestamp[frame_index]` 完全一致，所以 `frame_index` 可直接當陣列索引用。

### 其他區塊

- `at_release`：出手瞬間的 7 個單點值（`arm_extension`、`release_height`、`release_side`、`vertical_release_angle`、`horizontal_release_angle`、`shoulder_horizontal_abduction_angle`、`trunk_lateral_tilt`）
- `at_foot_plant`：`stride_length` 一項
- `peak`：5 個指標的峰值，各帶 `value` / `raw_value` / `frame_index` / `window` / `reliable`。**本樣本的 `elbow_varus_torque` 是 `reliable: false`**
- `release`：出手影格、座標、偵測方法與信心值
- `videos`：四個檔名字串，指向包內的 mp4／html。**前端不使用**（那些檔不在 public 下）

## 待與演算法端確認

### 1. `timeseries` 只有 7 條，xlsx 有 12 條

xlsx 的 `frame_angles` 工作表有 12 條逐影格指標，實測每格數值都在變動（unique 值數幾乎等於非空筆數），不是把單點值填滿整欄。但 JSON 的 `timeseries` 只給了其中 6 條，另外 6 條在 JSON 裡只剩 `peak` / `at_release` 的單點值，畫不出曲線：

| 只在 xlsx 有逐影格資料的指標 | 非空筆數 | 值域 | 在 JSON 裡的位置 |
|---|---|---|---|
| `shoulder_horizontal_abduction_angle` | 648 | -115.28 ~ 49.08 | `at_release` 單點 |
| `shoulder_abduction_angle` | 648 | 0.21 ~ 109.48 | `peak` 單點 |
| `elbow_varus_torque` | 531 | -122.13 ~ 129.73 | `peak` 單點 |
| `stride_length` | 677 | 19.31 ~ 125.52 | `at_foot_plant` 單點 |
| `trunk_lateral_tilt` | 657 | -9.72 ~ 33.63 | `at_release` 單點 |
| `hip_shoulder_separation` | 657 | -39.75 ~ 54.59 | `peak` 單點 |

**問題**：`timeseries` 是否應該補齊到與 xlsx 一致的 12 條？前端目前只畫得出 JSON 給的 7 條。

### 2. `shoulder_internal_rotation_angle` 是否為衍生欄位

實測它等於 `shoulder_external_rotation_angle` 取負號，且僅在 external 為負時有值——兩者同時有值的 447 筆全部吻合，external ≥ 0 的 155 筆則 internal 全為 null。看起來是同一條曲線在負值區的鏡像切片，不是獨立量測。

**問題**：這是刻意的呈現慣例，還是應該有獨立的量測來源？若確認為衍生，前端可以不把它列為獨立指標。

### 3. xlsx 沒有 `shoulder_internal_rotation_angle` 欄位

反過來，xlsx 的 12 條裡沒有這一條。兩份交付物的指標集合互有出入（交集 6 條），建議統一。
