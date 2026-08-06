# 3D 投球骨架動態圖(`/pose3d-demo`)

> 資料讀 `public/samples/` 靜態檔(不需 server route)、樣本已精簡、無 2D 疊圖變體。

投手投球動作的 3D 骨架逐幀播放:讀取 `outcome.json` 的多鏡位 3D 重建結果(COCO-17 keypoints、250fps、約 3 秒),以 **Three.js** 渲染骨架,支援播放/暫停、慢速(預設 0.25×)、拖曳進度條、跳到出手瞬間,播放中可自由拖曳旋轉視角。另有兩種「有身體」的呈現:真人模型版(`Pose3dHuman.vue`,把同一份 keypoints retarget 到 Mixamo 人形骨架)與程式生成素體版(`Pose3dCapsule.vue`,不載模型檔、keypoints 直接組幾何);兩者都可疊上骨架(`core/skeletonOverlay.ts`,可開關)看關節對應的身體部位。另有 Plotly 對照版(`../pitch-pose-plotly/`),用來並列比對兩種渲染器。

## 相關檔案

**這個資料夾只裝 Three.js 版。** 渲染器分家成三個資料夾，要哪一版就搬哪一組：

| 要什麼 | 搬哪些 |
|--------|--------|
| **Three.js 版**（本資料夾） | `pitch-pose/` + `pitch-pose-data/` + `scene3d/` |
| **Plotly 對照版** | `pitch-pose-plotly/` + `pitch-pose-data/` + `app/types/plotly.d.ts`（不需要 `scene3d/`） |

`npm run eslint` 會印出每個模組「需一併帶走」的清單，以那份為準。

| 檔案 | 責任 |
|------|------|
| `app/pages/pose3d-demo.vue` | 頁面:四種呈現切換、播放控制 UI、骨架疊顯開關 |
| `app/composables/usePose3dClip.ts` | 樣本載入 + rAF 播放時鐘(四版共用) |
| `app/components/pitch-pose/Pose3dSkeleton.vue` | Three.js 骨架渲染的 Vue 薄殼(~50 行) |
| `app/components/pitch-pose/core/poseSkeletonScene.ts` | **骨架場景本體(框架無關 class)**——換到 React／Svelte 只要重寫薄殼 |
| `app/components/pitch-pose/Pose3dHuman.vue` | three.js 真人模型渲染(GLTFLoader + OrbitControls) |
| `app/components/pitch-pose/core/pose3dRetarget.ts` | keypoints → 人形骨骼旋轉的 retarget 數學 + 骨長校正(有單元測試) |
| `app/components/pitch-pose/Pose3dCapsule.vue` | 程式生成素體渲染的 Vue 薄殼 |
| `app/components/pitch-pose/core/poseCapsuleScene.ts` | **素體場景本體(框架無關 class)**——不載模型檔,keypoints 直接組幾何 |
| `app/components/pitch-pose/core/skeletonOverlay.ts` | 骨架疊顯層(x-ray 骨頭線+關節球),真人版與素體版共用 |
| `app/components/pitch-pose-data/` | **外部依賴**:資料解析、時間軸查找、COCO 拓樸、軸範圍——兩種渲染器共用，必須一併帶上 |
| `app/components/scene3d/` | **外部依賴**:three 場景樣板、3D 軸盒、hover 標籤——只有 Three.js 版需要 |
| `app/components/pitch-pose-plotly/` | Plotly 對照版(props 介面相同可直接互換) |
| `public/samples/pose3d/outcome.json` | 樣本(749 frames、0.7MB;原始 18MB 只留前端讀得到的欄位) |
| `public/models/Xbot.glb` | 真人模型用的人形骨架(2.8MB,Mixamo 骨架,取自 three.js 官方範例) |

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
      PoseSkeletonScene.setTime() → findPoseFrame() 二分搜尋當前幀
      → 就地覆寫 Line2 的頂點 buffer 與 InstancedMesh 的矩陣(不重建物件)
```

### 演算法

**1. 骨架拓樸(COCO-17)**

Keypoint 索引(`app/components/pitch-pose-data/core/types.ts`):

```
0 nose, 1 left_eye, 2 right_eye, 3 left_ear, 4 right_ear,
5 left_shoulder, 6 right_shoulder, 7 left_elbow, 8 right_elbow,
9 left_wrist, 10 right_wrist, 11 left_hip, 12 right_hip,
13 left_knee, 14 right_knee, 15 left_ankle, 16 right_ankle
```

連線 `SKELETON_EDGES` 共 19 條(`app/components/pitch-pose-data/core/types.ts`):

- 臉部:0-1、0-2、1-2、1-3、2-4
- 耳→肩:3-5、4-6
- 軀幹:5-6、5-11、6-12、11-12
- 左臂 5-7、7-9;右臂 6-8、8-10
- 左腿 11-13、13-15;右腿 12-14、14-16

註:`outcome.json` 的 `clip.pose_meta.skeleton` 也帶 16 條連線定義(無臉部內連線與耳肩連線),前端未讀取,使用自己的 `SKELETON_EDGES`。

**2. 時間戳解析(`parseOutcomeTimestampMs`,`pitch-pose-data/core/parsePitchOutcome.ts`)**

格式 `"20260624_152027.597899"`(微秒精度)→ epoch 毫秒;第一個有效幀為 t0,所有幀時間 = absMs − t0。無 `pose_3d` 或時間戳無效的幀直接跳過。

**3. 當前幀查找(`findPoseFrame`,`pitch-pose-data/core/findPoseFrame.ts`)**

二分搜尋「最後一筆 `timestampMs <= timeMs`」的幀;若距離超過 `maxGapMs`(預設 250ms)回傳 null 清空畫面,避免資料斷檔時骨架凍結。

**4. 固定軸範圍(`pitch-pose-data/core/skeletonBounds.ts`)**

掛載時掃描**整段動作**所有 keypoint 的 min/max,加 15cm padding、圓整到 10cm 格,z 軸強制含地面 0。播放中不重算,避免骨架隨每幀資料範圍伸縮的「呼吸」效果。

空間比例不需要任何換算:three 的世界單位直接就是資料的 cm,1cm 在三軸的視覺長度天生一致。(Plotly 版得靠 `aspectratio` 人工換算成「每 200cm = 1 視覺單位」再鎖 `aspectmode: 'manual'`,還要加一條隱形 anchor trace 釘住 bounding box 防止自動縮放。)

**5. 視角操作**

OrbitControls 與資料更新天生解耦——播放中拖曳旋轉不需要任何 workaround。
(Plotly 版必須在 `pointerdown` 期間暫停重繪、`pointerup` 後延兩個 rAF 補畫,否則每秒 ~60 次的 `plotly.react()` 會不斷打斷 gl3d 的拖曳手勢;還得讀私有結構 `gd._fullLayout.scene._scene.getCamera()` 才保得住視角。)

預設相機:三壘側斜上方,方向比例 `(2.4, −1.8, 0.9)`,距離由 `Viewport.frameBox()` 依資料範圍自動算。

**6. 播放時鐘(`app/composables/usePose3dClip.ts`)**

```text
clockMs = (clockMs + (now - lastTick) × rate) % durationMs
```

rAF 驅動、速率可選 `[0.05, 0.1, 0.25, 0.5, 1]`(預設 0.25×,250fps 資料以約 62.5fps 視覺速度播放),循環播放;`release.frame_index` 對應幀的時間即「跳到出手瞬間」目標。

**7. 骨長校正(骨頭拉伸,`calibrateSkeleton()`)**

retarget 只設骨頭「旋轉」,骨長維持模型自身比例,所以身高、肩寬、軀幹長對不上這名
選手,而且誤差會沿骨鏈往末端累積(骨盆釘在資料上,手腕偏最多)。校正在載入時依資料
量到的骨長拉伸骨架,每位選手自動適配,不需要額外資產或人工量測。

| 段落 | 資料量測 | 縮放的骨鏈 |
|------|----------|-----------|
| 上臂 / 前臂 | 肩→肘 / 肘→腕 | `ForeArm` / `Hand` 的 local position |
| 大腿 / 小腿 | 髖→膝 / 膝→踝 | `Leg` / `Foot` |
| 肩寬 | 雙肩 keypoint 距離 | `Spine2`→兩側 `Arm` 的鏈 |
| 軀幹 | 髖中點→肩中點 | `Hips`→`Spine2` 的脊椎鏈 |
| 頸與頭 | 肩中點→耳中點 | `Neck`→`Head` |

四個非顯而易見的必要設定:

- **改子骨的 local position,不是 `bone.scale`。** 骨架裡一段骨頭的長度就是子骨相對
  親骨的位移;改 scale 會連帶縮放粗細、往下傳遞到整條子鏈(得逐層反向補償)、且非
  等比 scale 在關節處產生剪切。
- **改完不要呼叫 `skeleton.calculateInverses()`。** 蒙皮矩陣是
  `bone.matrixWorld × 綁定時的逆矩陣`,保留原始綁定網格才會跟著骨頭被拉長;重算逆
  矩陣等於重新綁定,骨頭移動了網格卻留在原處。
- **肩線參考點是雙臂根部中點,不是 `Spine2`。** Mixamo 的 `Spine2` 是胸椎骨,位置在
  肩線以下(肩膀還要再經 `Shoulder` 骨往上往外)。拿它當肩線會讓軀幹量得太短、頸部
  量得太長,兩個誤差還互相補償不易察覺。
- **修正量走加法(把 span 差額補到鏈長),不是讓 span 乘比例。** 軀幹與頸部量的距離
  跨越了被縮放的鏈以外的骨頭,乘法更新在鏈比 span 短時的收斂因子是 −偏移/目標,絕對
  值可能 >1 而發散振盪。

生產環境的四道防護:比例夾限在 `[0.7, 1.4]`(遮擋或重建失敗會產生離譜骨長,原封套用
會扯壞網格)、取**中位數**而非平均(單幀離群值不污染校正)、左右同名段**取平均**
(降噪並避免歪斜人偶)、被夾限與被略過的段落列進 `report`(那是資料異常的訊號,值得追)。

校正**必須早於 `new PoseRetargeter()`**——retargeter 建構時捕捉 rest 姿態的四元數與
腿長,要看到校正後的骨架(校正後 `fitModelScale()` 的整體等比縮放自然收斂到約 1)。

精度上限:COCO-17 的肩膀是體表標記點、Mixamo 的 `LeftArm` 是關節旋轉中心,兩者天生
差幾公分,校正後仍有系統性殘差,不會完美貼合。要拿去疊實拍影片對位前須先評估。

### 渲染

場景物件**建構一次,之後每幀只覆寫 buffer**(`core/poseSkeletonScene.ts`):

| 物件 | 型別 | 內容 |
|------|------|------|
| 骨頭 | `LineSegments2` | 19 條邊,線寬 6px |
| 關節 | `InstancedMesh` × 2(17 顆球) | 白心 + 骨架色外框(inverted hull),半徑 3.2cm |
| 軸盒 | `scene3d` 的 `createAxisBox()` | 外框 + 背板格線 + 刻度數字 + 軸標題 |
| hover | `scene3d` 的 `createHoverLabel()` | 游標靠近關節時顯示名稱 |

**缺測處理**:缺測邊的兩端點寫成同一座標,退化為零長線段(不會被光柵化,等同不畫);缺測關節的 instance `scale = 0`。

**兩個非顯而易見的必要設定**:

- 骨頭用 `LineSegments2` 而非 `LineSegments`——three 的 `LineBasicMaterial.linewidth` 在絕大多數平台**恆為 1px**,直接換過去線寬 6 會變成髮絲。代價是 `LineMaterial` 需要畫布尺寸算線寬,resize 時務必同步 `material.resolution`。
- 骨頭與關節都設 `frustumCulled = false`——每幀就地改 buffer 不重算 bounding sphere,開著視錐剔除模型會整個消失。

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
