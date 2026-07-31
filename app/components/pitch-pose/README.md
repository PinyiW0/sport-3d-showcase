# 3D 投球骨架動態圖(`/pose3d-demo`)

> 資料讀 `public/samples/` 靜態檔(不需 server route)、樣本已精簡、無 2D 疊圖變體。

投手投球動作的 3D 骨架逐幀播放:讀取 `outcome.json` 的多鏡位 3D 重建結果(COCO-17 keypoints、250fps、約 3 秒),以 Plotly 3D 渲染骨架,支援播放/暫停、慢速(預設 0.25×)、拖曳進度條、跳到出手瞬間,並保留使用者拖曳的視角。另有 three.js 真人模型版(`Pose3dHuman.vue`),把同一份 keypoints retarget 到人形骨架上。

## 相關檔案

| 檔案 | 責任 |
|------|------|
| `app/pages/pose3d-demo.vue` | 頁面:兩種呈現切換、播放控制 UI |
| `app/composables/usePose3dClip.ts` | 樣本載入 + rAF 播放時鐘(骨架版與真人版共用) |
| `app/components/pitch-pose/Pose3dSkeleton.vue` | Plotly 3D 骨架渲染(固定軸範圍、視角保留、拖曳防抖) |
| `app/components/pitch-pose/Pose3dHuman.vue` | three.js 真人模型渲染(GLTFLoader + OrbitControls) |
| `app/components/pitch-pose/core/parsePitchOutcome.ts` | outcome.json → `PitchPose3d` adapter(時間戳解析、缺測補 null,有單元測試) |
| `app/components/pitch-pose/core/pose3dRetarget.ts` | keypoints → 人形骨骼旋轉的 retarget 數學(有單元測試) |
| `app/components/pitch-pose/core/findPoseFrame.ts` | 時間軸二分搜尋(純邏輯) |
| `app/components/pitch-pose/core/types.ts` | COCO-17 keypoint 名稱與骨架連線(`SKELETON_EDGES`)定義 |
| `public/samples/pose3d/outcome.json` | 樣本(749 frames、0.7MB;原始 18MB 只留前端讀得到的欄位) |
| `public/models/Xbot.glb` | 真人模型用的人形骨架(2.8MB) |

**未搬入**:來源的 2D 影片骨架疊圖變體(`PoseCanvas.vue`、`PoseOverlay.vue`、`mockPose.ts`)與 server route(`server/api/pitch-outcome.get.ts`,精簡後改讀靜態檔)。

## 實作方式

### 資料流

```
public/samples/pose3d/outcome.json(0.7MB,精簡後)
  ↓ client 端 $fetch(靜態檔;dev SSR 的 nitro 內部 fetch 拿不到 public/)  usePose3dClip.ts
  ↓ parsePitchOutcome():
      clip.frames[].reconstruction.pose_3d → Pose3dFrame[]      parsePitchOutcome.ts
      · 時間戳 "YYYYMMDD_HHmmss.ffffff" → 相對第一幀的毫秒
      · 17 個槽位,缺測 keypoint 以 null 佔位(實測缺測率約 0.5%)
      · release.frame_index → releaseMs(出手瞬間)
  ↓ rAF 時鐘驅動 clockMs(可調速率 0.05–1×,模 duration 循環)  usePose3dClip.ts
  ↓ <Pose3dSkeleton :frames :time-ms>
      findPoseFrame() 二分搜尋當前幀 → buildTraces() → plotly.react()
```

### 演算法

**1. 骨架拓樸(COCO-17)**

Keypoint 索引(`app/components/pitch-pose/core/types.ts:48-66`):

```
0 nose, 1 left_eye, 2 right_eye, 3 left_ear, 4 right_ear,
5 left_shoulder, 6 right_shoulder, 7 left_elbow, 8 right_elbow,
9 left_wrist, 10 right_wrist, 11 left_hip, 12 right_hip,
13 left_knee, 14 right_knee, 15 left_ankle, 16 right_ankle
```

連線 `SKELETON_EDGES` 共 19 條(`app/components/pitch-pose/core/types.ts:72-97`):

- 臉部:0-1、0-2、1-2、1-3、2-4
- 耳→肩:3-5、4-6
- 軀幹:5-6、5-11、6-12、11-12
- 左臂 5-7、7-9;右臂 6-8、8-10
- 左腿 11-13、13-15;右腿 12-14、14-16

註:`outcome.json` 的 `clip.pose_meta.skeleton` 也帶 16 條連線定義(無臉部內連線與耳肩連線),前端未讀取,使用自己的 `SKELETON_EDGES`。

**2. 時間戳解析(`parseOutcomeTimestampMs`,`parsePitchOutcome.ts:56-66`)**

格式 `"20260624_152027.597899"`(微秒精度)→ epoch 毫秒;第一個有效幀為 t0,所有幀時間 = absMs − t0。無 `pose_3d` 或時間戳無效的幀直接跳過。

**3. 當前幀查找(`findPoseFrame`,`usePoseOverlay.ts:17-37`)**

二分搜尋「最後一筆 `timestampMs <= timeMs`」的幀;若距離超過 `maxGapMs`(預設 250ms)回傳 null 清空畫面,避免資料斷檔時骨架凍結。

**4. 固定軸範圍與等比例(`Pose3dSkeleton.vue:43-77`)**

掛載時掃描**整段動作**所有 keypoint 的 min/max,加 15cm padding、圓整到 10cm 格,z 軸強制含地面 0;`aspectratio` 以每 200cm = 1 視覺單位計算並固定(`aspectmode: 'manual'`)。播放中不重算,避免骨架隨每幀資料範圍伸縮的「呼吸」效果。另加一條隱形 anchor trace 釘住 bounding box 對角,防止 Plotly 自動縮放。

**5. 視角保留與拖曳防抖(`Pose3dSkeleton.vue:161-214`)**

- `layout.uirevision` 固定值:`plotly.react()` 重畫時保留使用者旋轉後的相機
- `pointerdown` 期間暫停重繪(`interacting` 旗標),`pointerup` 後延兩個 rAF 補畫,避免播放中每秒 ~60 次重繪打斷 gl3d 拖曳手勢
- 預設相機:三壘側斜上方,`eye = (aspect.x×2.4, −aspect.y×1.8, aspect.z×0.9)`

**6. 播放時鐘(`app/composables/usePose3dClip.ts`)**

```text
clockMs = (clockMs + (now - lastTick) × rate) % durationMs
```

rAF 驅動、速率可選 `[0.05, 0.1, 0.25, 0.5, 1]`(預設 0.25×,250fps 資料以約 62.5fps 視覺速度播放),循環播放;`release.frame_index` 對應幀的時間即「跳到出手瞬間」目標。

### 渲染

Plotly.js `scatter3d` 三條 trace(`Pose3dSkeleton.vue:79-141`):

| Trace | 模式 | 內容 |
|-------|------|------|
| anchor | markers(透明) | bounding box 兩對角,固定場景範圍 |
| 骨頭 | lines | 19 條邊,以 null 分段,線寬 6 |
| 關節 | markers | 白色圓點 size 3.5,hover 顯示關節名稱 |

任一端點為 null 的邊不畫;keypoint 為 null 的關節不畫。

## 資料來源需要的欄位

輸入:`public/samples/pose3d/outcome.json`(單球完整資料,約 18MB、749 幀)。

### 前端實際使用的欄位

| 欄位路徑 | 型別 | 單位 | 必填 | 用途 |
|----------|------|------|------|------|
| `pitch_id` | string | — | 否 | 頁面顯示投球 ID |
| `release.frame_index` | number | — | 否 | 出手瞬間的幀索引 →「跳到出手」功能 |
| `clip.throwing_hand` | string | — | 否 | 慣用手顯示(`THROWING_HAND_LEFT` / `THROWING_HAND_RIGHT`) |
| `clip.frames[]` | object[] | — | **是** | 逐幀資料,250fps、約 3 秒 |
| `clip.frames[].reconstruction.timestamp`(或 `aligned.timestamp`) | string | 微秒 | **是** | 幀時間 `"YYYYMMDD_HHmmss.ffffff"`,建時間軸用 |
| `clip.frames[].reconstruction.pose_3d` | `Record<"0"~"16", keypoint>` | — | **是** | COCO-17 keypoint 字典(key 為索引字串) |
| `…pose_3d[i].position.{x,y,z}` | number | cm | **是** | keypoint 3D 座標;任一缺漏該點視為缺測(null) |

**最低需求:每幀的時間戳 + 17 個 keypoint 的 `position.{x,y,z}`(cm)**;`release.frame_index` 與 `throwing_hand` 為加值欄位。

### keypoint 品質欄位(資料有、前端目前未使用)

| 欄位 | 型別 | 說明 |
|------|------|------|
| `…pose_3d[i].quality.cams_used` | string[] | 參與重建的相機(如 `["3B", "HB"]`) |
| `…pose_3d[i].quality.num_views` | number | 重建視角數 |
| `…pose_3d[i].quality.max_reproj_err_px` | number | 最大重投影誤差(px) |
| `…pose_3d[i].interpolated` | boolean | 是否為內插點 |
| `…pose_3d[i].smoothed` / `outlier_rejected` | boolean | 是否經平滑 / 離群剔除 |

### outcome.json 其他區塊(與骨架無關)

| 區塊 | 內容 |
|------|------|
| `clip.pose_meta` | keypoint 名稱、骨架連線、關節索引、`dataset_id: coco17_static`(前端用自己的常數) |
| `clip.frames[].aligned.detections` | 各相機(1B/3B/HB)的 2D 球/姿態偵測原始結果 |
| `clip.frames[].reconstruction.ball_*` | 球體 3D 重建(`ball_mv_filled`、`ball_interpolated`、`ball_smoothed`) |
| `release` 其餘欄位 | `ball_at_release`、`wrist_at_release`(cm)、`confidence`、`method`、debug |
| `clip.trigger_event` | 觸發來源(ball motion)與置信度 |
| `edge_health` | 各相機邊緣機健康狀態(模型簽名、CPU/GPU、延遲) |
| `status`、`processed_at`、`processing_latency_ms` | 處理狀態與延遲 |
