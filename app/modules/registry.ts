import type { ModuleSpec } from './types'
import { defineAsyncComponent } from 'vue'

// 全部 3D 研究模組的登錄表。索引頁與展示頁都讀這裡。
// done  = 研究告一段落（baseball-spin、clock-spin、pitch-pose-skeleton、
//         pitch-trajectory、strike-zone-grid、pitch-distribution）
// wip   = 有可運作實作可點進去看，但還在調整（pitch-pose-human、pose-metrics-chart）
// planned = 尚未動工，四個必備區塊先給文字輪廓、參考資料選填

// baseball-spin 樣本（後端 result.json 原格式，snake_case；取自 public/samples/spin/sample1）
const SPIN_SAMPLE = `{
  "timestamp": "2026-07-06 15:02:50",
  "rpm": 1297.66,
  "axis": [-0.5197, -0.709459, 0.476004],
  "animation": {
    "R_ref": [
      [0.405345, -0.342056, 0.847758],
      [-0.914098, -0.140553, 0.380355],
      [-0.010948, -0.929109, -0.369645]
    ],
    "omega_rad_per_frame": 0.27178053,
    "fps": 500
  },
  "spin_dir": { "hhmm": "04:47", "degrees": 143.78 },
  "spin_tilt": { "hhmm": "01:47", "degrees": 233.78 }
}`

// bt3d 樣本（後端 analysis_result.json 的畫圖欄位子集，25 球合併成一檔；軌跡點省略中段）
const BT3D_SAMPLE = `{
  "ts": "2025-09-11T18:36:34.697352",
  "pitch_trajectory": [
    [-21.61, 1600.0, 185.42],
    [-15.34, 1200.0, 165.88],
    "… 共 20 點 …",
    [6.73, 21.59, 71.05]
  ],
  "strike_zone_point": [6.73, 21.59, 71.05],
  "pitch_velocity": 108.7,
  "horizontal_offset": 6.73,
  "vertical_offset": 71.05
}`

// 落點分布樣本（合成資料，格式為 analysis_result.json 的子集加投手與球種；不含軌跡）
const DISTRIBUTION_SAMPLE = `{
  "ts": "2026-07-20T18:31:00.127000",
  "pitcher": "P01",
  "pitch_type": "SL",
  "strike_zone_point": [2.89, 21.59, 57.26],
  "pitch_velocity": 123.81
}`

// 姿態生物力學樣本（後端 biomech.json schema_version 6，真實量測；timeseries 各 748 筆，此處省略中段）
const BIOMECH_SAMPLE = `{
  "schema_version": 6,
  "pitch_id": "pitch_20260624_152505.265147_2a4264",
  "throwing_hand": "right",
  "frame_count": 748,
  "units": { "angles": "degree", "distances": "cm", "timestamps": "UTC ISO-8601" },
  "events": {
    "leg_lift":   { "frame_index": 211, "timestamp": "2026-06-24T15:25:03.313518" },
    "foot_plant": { "frame_index": 608, "timestamp": "2026-06-24T15:25:04.901448" },
    "release":    { "frame_index": 637, "timestamp": "2026-06-24T15:25:05.018642" }
  },
  "timeseries": {
    "timestamp": ["2026-06-24T15:25:02.469251", "… 共 748 筆 …"],
    "elbow_flexion_angle": [140.84, 140.79, null, "… 共 748 筆，缺測為 null …"],
    "shoulder_external_rotation_angle": [], "shoulder_internal_rotation_angle": [],
    "lead_knee_flexion": [], "trunk_rotation": [], "trunk_anterior_tilt": [], "pelvis_rotation": []
  },
  "at_release": { "arm_extension": 175.06, "release_height": 164.2, "trunk_lateral_tilt": 12.5 },
  "at_foot_plant": { "stride_length": 119.3 },
  "peak": {
    "shoulder_external_rotation_angle": {
      "value": 158.49, "raw_value": 143.23, "frame_index": 632,
      "window": "foot_plant→release", "reliable": true
    }
  }
}`

// pose3d 樣本（後端 outcome.json，只留前端讀得到的欄位；pose_3d 為 COCO-17 id → 座標）
const POSE3D_SAMPLE = `{
  "pitch_id": "pitch_20260624_152029.893901_372197",
  "release": { "frame_index": 637 },
  "clip": {
    "throwing_hand": "THROWING_HAND_LEFT",
    "frames": [
      {
        "reconstruction": {
          "timestamp": "20260624_152027.597899",
          "pose_3d": {
            "9": { "position": { "x": 30.227, "y": 1638.627, "z": 78.477 } },
            "6": { "position": { "x": 12.01, "y": 1618.805, "z": 122.795 } },
            "… 共 17 個 keypoint …": {}
          }
        }
      }
    ]
  }
}`

export const modules: ModuleSpec[] = [
  {
    slug: 'baseball-spin',
    title: '棒球轉軸視覺化',
    sport: 'baseball',
    status: 'done',
    summary: '吃演算法後端的 result.json，用 Three.js 重現該球真實旋轉（含縫線樣貌），並疊上依 spin_tilt 旋轉的轉軸指針。',
    tags: ['Three.js', 'spin-axis', 'glTF'],
    updated: '2026-07',
    demoRoute: '/spin-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/BaseballSpinShowcase.vue')),
    tech: [
      'Three.js（raw，正交相機）',
      'glTF 模型載入（GLTFLoader）',
      'Zod 資料驗證',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '單顆球的旋轉解算結果：轉速、相機系自轉軸、起始姿態矩陣 R_ref、每影格角速度，與時鐘制轉軸／方向。',
      format: 'SpinResult（core/types.ts，Zod 驗證；wire 為 snake_case → camelCase）',
      sample: SPIN_SAMPLE,
      sampleUrl: 'public/samples/spin/{sample1..3}/result.json',
    },
    handoff: {
      files: [
        'app/components/baseball-spin/（整包，含 core/ 純 TS 零 Vue 依賴）',
        'public/models/baseball_detail.glb（演算法同款模型）',
        'public/samples/spin/（目視比對用樣本）',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'three', '@types/three（dev）', 'zod', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '播放倍率 speed（1 = 真實轉速）',
        '轉軸指針開關 show-axis-arrow',
        '三視角 core/views.ts（camera／pitcher／batter，preset 已預留）',
        'model-url 可換模型（縫線初始朝向須與演算法一致）',
      ],
    },
    references: [
      { label: 'docs/3d棒球旋轉視覺化研究筆記.md（選型、模型來源、參數定義）' },
      { label: 'app/components/baseball-spin/README.md（用法與數學慣例）' },
    ],
  },
  {
    slug: 'clock-spin',
    title: '時鐘轉軸',
    sport: 'baseball',
    status: 'done',
    summary: '把 spin_tilt 以 2D 時鐘面板呈現：盤面靜態、指針整組 rotate(spin_tilt.degrees)。與 baseball-spin 的 3D 指針是同一份資料的兩種呈現。',
    tags: ['SVG', '2D', 'spin-tilt'],
    updated: '2026-07',
    demoRoute: '/clock-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/ClockSpinShowcase.vue')),
    tech: [
      '純 SVG（無 3D 函式庫、無圖檔）',
      '12 點盤面幾何（12 點在正上方＝角度 −90°）',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '沿用 baseball-spin 的 spin_tilt（時鐘制 hhmm + degrees），不需 3D 姿態矩陣；元件只吃 degrees 與 hhmm 兩個值。',
      format: '複用 SpinResult.spinTilt（ClockValue）',
      sample: SPIN_SAMPLE,
      sampleUrl: 'public/samples/spin/{sample1..3}/result.json（與 baseball-spin 共用）',
    },
    handoff: {
      files: [
        'app/components/clock-spin/（整包 cp 即可，含 core/ 純 TS 與其單元測試）',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '指針樣式 pointer：chevron（V 形沿軸排列）／arrow（單一實心箭頭）',
        '盤面配色與半徑（core/clock-geometry.ts 的 cx/cy/radius）',
        '標籤列文字（label prop，預設「轉軸方向」）',
        '要讓箭頭與標籤同側就傳 degrees - 180（元件不做換算）',
      ],
    },
    references: [
      { label: '指針樣式兩種並存：chevron 與 arrow，由 pointer prop 切換' },
      { label: '資料慣例：degrees 比自己的 hhmm 多約 180°、且未正規化到 0–360，詳見模組 README' },
      { label: 'baseball-spin README §數學慣例（投影角 ≡ 90° − spin_tilt.degrees）' },
    ],
  },
  {
    slug: 'pitch-pose-skeleton',
    title: '投球姿態 3D 骨架',
    sport: 'baseball',
    status: 'done',
    summary: '把多鏡位重建的 COCO-17 骨架逐幀播放，用 Three.js 畫點線圖；軸範圍固定，播放中空間不會跟著資料「呼吸」，且播放與視角操作天生解耦——拖曳旋轉不會被每秒 60 次的重繪打斷。',
    tags: ['Three.js', 'pose', 'skeleton', 'COCO-17'],
    updated: '2026-08',
    demoRoute: '/pose3d-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/PitchPoseSkeletonShowcase.vue')),
    tech: [
      'Three.js（Line2 骨頭 + InstancedMesh 關節 + 自繪 3D 軸盒）',
      'COCO-17 骨架拓樸（19 條骨頭）',
      'rAF 播放時鐘（0.05–1× 可調）',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '單球約 3 秒、250fps 的多鏡位 3D 重建骨架：每幀 17 個 COCO keypoint 的世界座標（cm），外加出手瞬間的 frame index。',
      format: 'PitchPose3d（pitch-pose-data/core/parsePitchOutcome.ts；wire 為 outcome.json 的 clip.frames[].reconstruction.pose_3d）',
      sample: POSE3D_SAMPLE,
      sampleUrl: 'public/samples/pose3d/outcome.json（749 frames，0.7MB）',
    },
    handoff: {
      files: [
        '要 Three.js 版 → app/components/pitch-pose/ + pitch-pose-data/ + scene3d/',
        '要 Plotly 版 → app/components/pitch-pose-plotly/ + pitch-pose-data/ + app/types/plotly.d.ts（不需要 scene3d）',
        'app/components/pitch-pose-data/（渲染器無關的資料層：outcome 解析、時間軸查找、COCO 拓樸、軸範圍，含單元測試）',
        'app/composables/usePose3dClip.ts（樣本載入 + 播放時鐘）',
        'public/samples/pose3d/outcome.json',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'three（Three.js 版）', '@types/three（dev）', 'plotly.js-dist-min（Plotly 版）', 'tailwindcss（元件的 class 樣式）', '資料層 pitch-pose-data 零 npm 依賴'],
      flexPoints: [
        '骨架顏色 color、畫布高度 height、深色畫布 dark',
        '播放速率（usePose3dClip 的 rate，預設 0.25×）',
        '資料空洞容忍值 DEFAULT_MAX_GAP_MS（預設 250ms）',
        '骨架拓樸 SKELETON_EDGES（core/types.ts，換 keypoint 定義時改這裡）',
        '空間留白與圓整（pitch-pose-data/core/skeletonBounds.ts 的 PAD_CM / STEP_CM）',
        '軸盒刻度密度與配色（scene3d/core/axisBox.ts 的 chooseTickStep 與 AXIS_THEME）',
      ],
    },
    references: [
      { label: 'COCO-17 keypoint 定義（mmpose）', href: 'https://mmpose.readthedocs.io/en/latest/dataset_zoo/2d_body_keypoint.html#coco' },
      { label: '同頁可切 Plotly 對照版：換渲染器後軸刻度與視角行為是否等價，並列比對最快' },
    ],
  },
  {
    slug: 'pitch-pose-human',
    title: '投球姿態 3D 真人模型',
    sport: 'baseball',
    status: 'wip',
    summary: '同一份 COCO-17 骨架，改用 three.js 把 keypoints retarget 到人形 glTF 模型驅動骨骼。目前是可運作的初版：手腕、脊椎等 COCO-17 沒有的關節為近似值，three.js 路線仍在研究調整中。另可切換為程式生成素體（keypoints 直接組幾何、無 retarget 近似），兩者都能疊上骨架看關節對應的身體部位。',
    tags: ['Three.js', 'pose', 'retarget', 'glTF'],
    updated: '2026-08',
    demoRoute: '/pose3d-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/PitchPoseHumanShowcase.vue')),
    tech: [
      'Three.js（GLTFLoader、OrbitControls、Quaternion retarget）',
      'Xbot.glb（three.js 官方範例人形骨架）',
      '骨長校正（依資料量到的骨長拉伸骨架，每位選手自動適配）',
      '程式生成素體（圓柱四肢＋關節球＋定向橢球軀幹，不載模型檔）',
      '骨架疊顯（x-ray，關閉 depthTest）',
      '缺測 keypoint 線性補值',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '與骨架版同一份資料（COCO-17、250fps）；另用腿長中位數推估人形模型的縮放比例。',
      format: '同 PitchPose3d，再經 core/pose3dRetarget.ts 轉成 three.js 座標系與骨骼旋轉',
      sample: POSE3D_SAMPLE,
      sampleUrl: 'public/samples/pose3d/outcome.json（749 frames，0.7MB）',
    },
    handoff: {
      files: [
        'app/components/pitch-pose/（整包 cp 即可，含單元測試；真人版另需 Pose3dHuman.vue + core/pose3dRetarget.ts，素體版需 Pose3dCapsule.vue + core/poseCapsuleScene.ts）',
        'app/composables/usePose3dClip.ts（樣本載入 + 播放時鐘）',
        'public/models/Xbot.glb（人形骨架模型，2.8MB；只有真人模型版需要，素體版不載任何模型檔）',
        'public/samples/pose3d/outcome.json',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'three', '@types/three（dev）', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '人形模型可換（骨骼命名須對得上 retarget 對照表）',
        '模型縮放依腿長中位數自動推估，可改為固定值',
        '素體的肢體粗細、配色（左右半身分色）寫在 poseCapsuleScene.ts 常數區',
        '骨架疊顯預設值：真人版關、素體版開，由 skeleton prop 控制',
        '骨長校正可關（calibrate prop）；比例夾限與校正回合數在 pose3dRetarget.ts 常數區',
        'OrbitControls 初始視角與畫布高度 height',
      ],
    },
    limitations: [
      '每位選手都要重建一次人形：模型骨長是固定的，換一位投手就得依他的 keypoints 重跑骨長校正、重新產生骨架。校正已自動化（不需人工量測），但仍是每次載入的必要步驟；體型差異超過約 ±30% 時，蒙皮網格會在關節處出現擠壓變形。相較之下素體版由 keypoints 直接長出身體，任何體型天生吻合、沒有這層成本。',
      '手掌與手指的細部姿勢無資料可呈現：COCO-17 每隻手只有一個「手腕」點，沒有掌心朝向與指節，握球方式與出手瞬間的撥指動作都無法還原，模型的手只能維持 rest pose 的固定姿勢。這對投球分析是實質缺口（握法與出手是球種與轉軸的關鍵），要補上得改用帶手部關鍵點的姿態模型（如 COCO-WholeBody 133 點或 MediaPipe Hands）重新產出資料。',
      '骨架與模型的關節定義天生有落差：COCO-17 的肩膀是體表標記點、Mixamo 的 LeftArm 是關節旋轉中心，兩者差幾公分，骨長校正後仍有系統性殘差，不會完美貼合。純展示足夠，要疊在實拍影片上對位前須先評估。',
      '手腕旋轉、脊椎逐節彎曲等 COCO-17 沒有的自由度維持 rest pose，為近似值。',
    ],
    references: [
      { label: 'app/components/pitch-pose/core/pose3dRetarget.ts（retarget 數學與骨骼對照）' },
    ],
  },
  {
    slug: 'batter-pose-skeleton',
    title: '打者姿態 3D 骨架',
    sport: 'baseball',
    status: 'planned',
    summary: '以 3D 骨架重建打者揮棒姿態，供逐關節檢視與角度量測。渲染與播放層可直接複用 pitch-pose 系列，差別在資料來源是打者而非投手。',
    tags: ['pose', 'skeleton', 'batting'],
    tech: ['沿用 pitch-pose 的 Three.js 骨架渲染（PoseSkeletonScene + scene3d 軸盒）', '打者姿態估計輸出解析'],
    data: {
      summary: '每影格關節 3D 座標（世界座標）與骨架連結；需一致的座標系與揮棒事件（觸球瞬間）定義。',
      format: '（規劃中）預期同 PitchPose3d，事件欄位由出手改為揮棒／觸球',
    },
    handoff: {
      files: ['（規劃中）沿用 app/components/pitch-pose/，補打者資料 adapter'],
      flexPoints: ['骨架拓樸', '座標系對齊', '關節配色與標籤'],
    },
    references: [
      { label: '渲染與播放層可直接複用 pitch-pose-skeleton' },
    ],
  },
  {
    slug: 'pitch-trajectory',
    title: '來球 3D 軌跡圖',
    sport: 'baseball',
    status: 'done',
    summary: '用 Three.js 在同一個 3D 場景畫出投球軌跡、本壘板實體與好球帶九宮格；採暗色主題，世界單位直接是 cm，1cm 在三軸的視覺長度天生一致、空間不變形。',
    tags: ['Three.js', 'trajectory', '3D', 'strike-zone'],
    updated: '2026-08',
    demoRoute: '/pitch3d-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/PitchTrajectoryShowcase.vue')),
    tech: [
      'Three.js（Line2 軌跡與九宮格 + BufferGeometry 本壘板 + 自繪 3D 軸盒）',
      '暗色主題（黑底 + 琥珀黃軌跡）',
      '本壘板五邊形自動生成側面與底面',
      '世界單位即 cm（不需 Plotly 那套 aspectratio 人工換算）',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '每球的擬合軌跡點（20 點，cm）與入壘點；好球帶框不在資料裡，由固定 175cm 身高比例推算。',
      format: 'PitchAnalysisResult（pitch-trajectory-data/core/trajectoryGeometry.ts；wire 為後端 analysis_result.json 的 snake_case 子集）',
      sample: BT3D_SAMPLE,
      sampleUrl: 'public/samples/bt3d/pitches.json（25 球合併，18KB）',
    },
    handoff: {
      files: [
        '要 Three.js 版 → app/components/pitch-trajectory/ + pitch-trajectory-data/ + scene3d/ + baseball-field/',
        '要 Plotly 版 → app/components/pitch-trajectory-plotly/ + pitch-trajectory-data/ + baseball-field/ + app/types/plotly.d.ts（不需要 scene3d）',
        'app/components/pitch-trajectory-data/（渲染器無關的資料層：軌跡解析、場地幾何、軸範圍、配色，含單元測試）',
        'app/components/baseball-field/（場地與好球帶常數的單一來源，資料層直接相依）',
        'app/composables/useBt3dSamples.ts（樣本讀取，與 strike-zone-grid 共用）',
        'public/samples/bt3d/pitches.json',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'three（Three.js 版）', '@types/three（dev）', 'plotly.js-dist-min（Plotly 版）', 'tailwindcss（元件的 class 樣式）', '資料層 pitch-trajectory-data 零 npm 依賴'],
      flexPoints: [
        '相機距離 zoom（>1 拉遠、<1 放大）與完整視角覆寫 cameraEye',
        '打者身高 batterHeightCm（推算九宮格上下緣，預設 175）',
        '畫布 width／height',
        '整套配色集中在 pitch-trajectory-data/core/trajectoryGeometry.ts 的 CHART_THEME（換主題只動這一組常數）',
        '線寬與標記尺寸（core/trajectoryScene.ts 的 WIDTH_PX / MARKER_RADIUS_CM / PATH_DOT_PX）',
      ],
    },
    references: [
      { label: '座標系：原點為本壘板尖端、y 正向朝投手、單位 cm' },
      { label: '幾何與配色由 pitch-trajectory-data 供應，Three.js 版與 Plotly 對照版共用同一份計算' },
    ],
  },
  {
    slug: 'strike-zone-grid',
    title: '九宮格落點圖',
    sport: 'baseball',
    status: 'done',
    summary: '把入壘點投影到好球帶九宮格的純 SVG 呈現，含好壞球幾何判定與本壘板、打擊區的透視底座；縮放為真實比例等比換算，不會把好球帶畫扁。',
    tags: ['SVG', 'strike-zone', '2D', '好壞球判定'],
    updated: '2026-07',
    demoRoute: '/bt3d-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/StrikeZoneGridShowcase.vue')),
    tech: [
      '純 SVG（無 3D 函式庫）',
      '好球帶比例：上緣 = 身高 × 0.535、下緣 × 0.27（對齊後端）',
      '九宮格分格判定 classifyCell',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '每球的入壘點 [x, y, z]（cm）；好球帶框不在資料裡，由打者身高比例推算（模組呈現可切少棒／青少棒／青棒／成棒），內部計算轉英尺。',
      format: 'PitchLocation / StrikeZone（core/types.ts；由 pitchFromStrikeZonePoint 從後端 strike_zone_point 轉換）',
      sample: BT3D_SAMPLE,
      sampleUrl: 'public/samples/bt3d/pitches.json（25 球合併，18KB）',
    },
    handoff: {
      files: [
        'app/components/strike-zone-grid/（整包 cp，含 core/ 純 TS 零 Vue 依賴與其單元測試）',
        'app/components/baseball-field/（場地與好球帶常數的單一來源，必須一併帶走）',
        'app/composables/useBt3dSamples.ts（樣本讀取，與 pitch-trajectory 共用）',
        'public/samples/bt3d/pitches.json',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '好球帶外圍留白 paddingFraction（預設 0.5）',
        '格號顯示 show-labels、本壘板與打擊區 show-field',
        '落點半徑 pitch-radius',
        '本壘板半寬 DEFAULT_PLATE_HALF_WIDTH（0.708 ft，MLB 17 吋規格）',
        '打者級別 BATTER_LEVELS（少棒 135／青少棒 157／青棒 170／成棒 172 cm，只改好球帶上下緣）',
      ],
    },
    references: [
      { label: '座標：px = 距本壘板中心水平位移、pz = 離地高度，單位英尺' },
      { label: '場地與好球帶規格：spec/domain/baseball-field-coordinates.md（§5 為打者級別與代表身高的推導）' },
    ],
  },
  {
    slug: 'pitch-distribution',
    title: '落點分布圖',
    sport: 'baseball',
    status: 'done',
    summary: '一批投球在好球帶上的分布：九宮格熱區看集中在哪，散點疊圖看實際散布與框外的球，可依投手與球種篩選。與九宮格落點圖的分工是「這批球」對「這一球」。',
    tags: ['SVG', 'heatmap', 'distribution', '2D'],
    updated: '2026-07',
    presentation: defineAsyncComponent(() => import('~/components/modules/PitchDistributionShowcase.vue')),
    tech: [
      '純 SVG（無 3D 函式庫、無圖表庫）',
      '同色散點合併成單一 path：600 顆點只有 2 個 DOM 節點',
      'fill-opacity 疊出密度，不必算 KDE',
      '座標直接用 cm，SVG 單位 = 1cm 故天然等比例',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '每球的入壘點 [x, y, z]（cm）加投手與球種兩個篩選維度；不需要軌跡。好球帶框由打者級別的代表身高推算。',
      format: 'DistributionPitch（core/distribution.ts；由 useDistributionSamples 從後端 snake_case 轉換）',
      sample: DISTRIBUTION_SAMPLE,
      sampleUrl: 'public/samples/bt3d/distribution.json（600 球，79KB，合成資料）',
    },
    handoff: {
      files: [
        'app/components/pitch-distribution/（整包 cp，含 core/ 與其單元測試）',
        'app/components/baseball-field/（場地與好球帶常數的單一來源，必須一併帶走）',
        'app/composables/useDistributionSamples.ts（樣本讀取，Nuxt 專用）',
        'public/samples/bt3d/distribution.json',
        'scripts/gen-distribution-sample.mjs（樣本生成，npm run gen:sample）',
      ],
      dependencies: ['Nuxt 4（showcase 靠 auto-import 取得 ref/computed，模組本身只 import vue）', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '好球帶四周留白 paddingFraction（預設 1 = 各留一倍好球帶尺寸）',
        '落點半徑 pointRadius（預設 2cm）與 fill-opacity（0.32，重疊即熱區）',
        '熱區／落點／格內球數三個顯示開關',
        '打者級別（只改好球帶上下緣，不影響落點）',
      ],
    },
    references: [
      { label: '樣本為合成資料：真實的 pitches.json 只有 25 球且無 pitcher／pitch_type 欄位，撐不起篩選' },
      { label: '各球種落點中心依球種特性設定（速球偏高、變化球偏低），是示意值不是量測值' },
      { label: '場地與好球帶規格：spec/domain/baseball-field-coordinates.md' },
    ],
  },
  {
    slug: 'pose-metrics-chart',
    title: '投手姿態數據線性圖',
    sport: 'baseball',
    status: 'wip',
    summary: '把單球的七條姿態角度疊在同一條 ±180 的角度軸上，橫軸為影格序號，配上抬腿／踏地／出手三條事件線，看動作鏈上各關節什麼時候到頂。在圖上拖曳可讀出該影格的全部數值，圖例可逐條點掉單獨看。',
    tags: ['SVG', 'line-chart', 'biomech', 'multi-series'],
    updated: '2026-08',
    presentation: defineAsyncComponent(() => import('~/components/modules/PoseMetricsChartShowcase.vue')),
    tech: [
      '純 SVG 折線（無圖表庫：不裝 chart.js／plotly）',
      '兩種版面：分列（預設，各自最佳值域）與疊圖（共用 ±180 軸，看得到交叉點）',
      '分列解決的是壓扁——疊圖時軀幹前傾只用到軸高的 16%、肩膀內旋 25%',
      '一條指標一個 path、748 個點只有 1 個 DOM 節點',
      '缺口雙門檻：≤10 格且兩端角度差 ≤15 度才接起來，其餘留白不猜',
      '±180 環繞角以相鄰差 > 180 判定並斷線，不畫貫穿全圖的假垂直線',
      'X 軸是影格序號（約 250fps，取樣不等距，實測相鄰間隔 0.6～9.0 ms）',
      '平滑分兩層：Catmull-Rom 只改點與點怎麼連（點不動），高斯低通才動數值',
      '高斯逐段濾波，段落端點用反對稱延拓——截短窗口會把端點往內拉 0.9 度',
      '缺口門檻與濾波強度不寫死：每次拿到資料重新推導（fps、缺口分布、事件間隔）',
      'Y 軸用角度的自然分度（45 一格），通用 1／2／5 階梯會給出 100 度這種刻度',
      '深淺兩套完整配色（theme prop，預設 light）：深底用 200–300 色階、白底換 500–600',
      '七色的色相在環上拉開（紅／橘／黃／綠／藍／紫／洋紅）；圖表與圖例共讀 core/palette.ts',
      '拖曳游標讀值：面板列出當下影格的各項數值（小數一位），塞不下就翻到游標另一側',
      '游標位置走 defineModel，父層綁 v-model 就能拿去驅動別的畫面',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '單球的 biomech.json（schema_version 6）：748 影格 × 7 條角度序列（degree，缺測為 null）、抬腿／踏地／出手三個事件的 frame_index、以及 peak 與 at_release 摘要。不需要 3D 骨架與影片。',
      format: 'PoseMetrics（core/parseBiomech.ts；由 parseBiomech 從後端原檔轉換）',
      sample: BIOMECH_SAMPLE,
      sampleUrl: 'public/samples/pose-metrics/biomech.json（748 影格 × 7 指標，151KB，真實量測；後端原檔，欄位與數值未改）',
    },
    handoff: {
      files: [
        'app/components/pose-metrics-chart/（整包 cp，含 core/、兩個版面元件與其單元測試；零外部相對依賴，不必連帶帶走其他資料夾）',
        'app/composables/usePoseMetrics.ts（樣本讀取＋參數推導的串接層；接真 API 時改用其中的 usePoseMetricsFrom 餵回應即可）',
        'public/samples/pose-metrics/biomech.json',
      ],
      dependencies: [
        'Nuxt 4（showcase 靠 auto-import 取得 ref/computed，模組本身只 import vue）',
        'tailwindcss（線條與文字的顏色 class）',
      ],
      flexPoints: [
        '顯示哪幾條指標（metricKeys prop）與事件線／平滑／接缺口三個開關',
        '游標影格（v-model:hoverFrame，不綁就由元件自己記著）與 interactive 總開關',
        'viewBox 尺寸 viewWidth/viewHeight（預設 960×360）',
        '版面（分列／疊圖）、每列高度 rowHeight、配色主題（theme prop：light／dark）與兩套色表',
        '窄畫面的分界與字級（COMPACT_BREAKPOINT／COMPACT_FONT_SIZE）',
        '參數推導的三個常數（core/autoTuning.ts）：缺口的毫秒上限、角度門檻的 MAD 係數、各級平滑的時間常數',
        '缺口門檻也可直接傳 maxBridgeFrames／maxBridgeDelta 覆寫推導值',
        '環繞角斷線閾值 WRAP_THRESHOLD_DEG（預設 180 = 值域的一半）',
        '角度軸範圍 ANGLE_DOMAIN 與刻度階梯 DEGREE_TICK_STEPS',
        '七條的配色 core/palette.ts（圖表與圖例共讀同一份）',
        '與 3D 骨架的游標連動（尚未實作，前提條件見已知限制）',
      ],
    },
    limitations: [
      '七條指標的缺測率從 2.5%（軀幹旋轉）到 40.2%（肩膀內旋）不等，缺測代表姿態估計在該影格失敗（遮蔽或關鍵點信心不足），不是雜訊。畫線時只接「安靜的小洞」：缺口在 10 格（40ms）內且兩端角度差不到 15 度才連過去，實測多數缺口兩端只差 1～3 度，接起來的誤差比線寬還小。長度不能單獨當門檻——肩膀外旋在第 604～613 格同樣只缺 10 格，兩端卻差 86.2 度，而那正是踏地到出手之間最劇烈的階段，一條直線補過去等於捏造一段沒量到的軌跡，所以那個洞留著。關掉「接小缺口」可以看原始的斷點分布（肩膀外旋會碎成 25 段）。',
      '軀幹旋轉與髖部旋轉的值域是 ±180 的環繞角，資料裡實際出現 358.3 度（軀幹）與 355.9 度（骨盆）的相鄰跳變，那是越過 ±180 邊界而不是真的轉了 358 度。目前處理是相鄰差超過 180 就斷線，所以那裡會看到缺口。另一條路是 unwrap（累加 ±360 讓角度連續），但實測 unwrap 後值域會跑到 -225.7～-9.7（軀幹）與 -222.9～-37.9（髖部），落在 ±180 內的比例從 85% 掉到 14%，反而更難畫，也與 peak 及 at_release 的數字對不上，因此在後端明確定義該用哪種表示之前不做。',
      '逐影格指標只有七條。同一批交付的 xlsx（frame_angles 工作表）另有六條逐影格資料——肩外展、肩水平外展、髖肩分離、肘內翻力矩、跨步距離、軀幹側傾——但 biomech.json 的 timeseries 沒給，在 JSON 裡只剩 peak／at_release 的單點值，畫不成曲線。要補齊得請演算法端把 timeseries 補到與 xlsx 一致，落差清單見 doc/投手姿態frame.md。',
      '肩膀內旋是純衍生欄位：實測 447 個有值點 100% 等於肩膀外旋取負號，且只在外旋為負時才有值，畫出來就是外旋曲線負半段的鏡像，不帶新資訊。保留它是為了對得上後端 peak 區塊的同名欄位；圖例點掉它，剩下的六條就都是獨立量測。',
      '線條平滑分兩層，代價不同。Catmull-Rom 只改「點與點之間怎麼連」，每個資料點的位置一個都沒動、線仍穿過所有原始點。高斯低通則會**實際動到數值**：預設的中等強度（σ=1.5）實測讓曲率降 78%、峰值一位小數都沒變，但出手那一格會偏 2.6 度；切到強（σ=3）曲率降 91%、視覺最順，出手格則偏 7.9 度——那是整段動作最劇烈的瞬間，順度與保真在這裡是直接衝突的，所以做成可切換而不是寫死。對姿態估計資料做低通是生物力學的標準處理（後端自己的 peak 也分 value 與 raw_value、差了 15 度），但拖曳游標讀到的數值一律取自原始資料，不受平滑影響。',
      'peak 有五個指標，但只有肩外旋與肩內旋兩條有對應曲線，其餘三個（肩外展、髖肩分離、肘內翻力矩）標不到圖上、只能當數值卡。另外 peak.value 是平滑後的值（肩外旋實測 158.49 對曲線上的 143.23），而肩內旋的 value 與 raw_value 都帶著外旋的正負號（-87.63／-90.26 對序列裡的 +90.26），所以圖上的峰值標記無論座標或標籤數字都取曲線在該 frame_index 的實際值，不採用 peak 的任一數值欄位——後端原值改由下方的峰值卡呈現，那裡沒有位置可以矛盾。',
      '橫軸固定畫到第 750 影格，不隨交付長度伸縮。演算法端每次交付的影格數不固定（這顆是 748），軸跟著資料走的話短交付會被拉滿整個寬度、看不出不足，兩顆球也並排比不了；固定之後交付不足的部分就是右邊那塊空白，游標拖進去各列讀數顯示「—」。代價是超過 750 格的交付畫不出來——軸不會自動延伸，這是刻意的取捨而非疏漏，展示頁在資料超過名目長度時會在資訊列明說。750 是設定值不是量測值：biomech.json 沒有任何欄位宣告擷取窗有多長（frame_count 講的是實際交付幾格），換一套擷取設定要改 NOMINAL_FRAME_SPAN 或傳 frameSpan prop。',
      '一次只吃一球，沒有跨球疊圖或同投手多球比較。要做多球比較，呼叫端得先決定對齊方式（依事件對齊或依絕對時間對齊），那是另一個資料層問題。',
      '尚未與 3D 骨架游標連動。前提條件已驗證成立——同一球的 outcome.json 與 biomech.json 是 748 影格逐格對應、每格時間戳完全相同、release 都在第 637 格——但 public/samples/pose3d/outcome.json 目前是另一顆球（152029.893901，左投），要連動得先把該樣本換成同一顆球。兩邊時間戳格式不同（biomech 是 ISO-8601、outcome 是 YYYYMMDD_HHMMSS.micro），都必須以 UTC 解讀，混用本機時區會差八小時。',
      '慣用手目前只顯示不使用。角度的正負號慣例很可能與慣用手綁定（左投的軀幹旋轉正負相反），但這份資料只有一球右投，沒有第二筆可以驗證，所以不做任何依慣用手的鏡像處理——沒有證據的翻轉比不翻轉更危險。',
    ],
    references: [
      { label: '資料來源與欄位定義、待與演算法端確認的落差：doc/投手姿態frame.md' },
      { label: '取樣不等距：相鄰間隔 0.6～9.0 ms、平均 4.0 ms，全長 2.992 秒（約 250fps）' },
      { label: '事件位置：抬腿第 211 影格、踏地第 608、出手第 637；踏地到出手僅 29 格（117 ms）' },
      { label: '角度軸固定 ±180：軀幹與髖部旋轉實測走到 -178.7 與 -176.7，收窄到 -90 會裁掉其中 14.8% 與 19.2% 的點' },
      { label: '斷線、環繞角與刻度三個決策的完整推導：app/components/pose-metrics-chart/README.md' },
    ],
  },
]

export function findModule(slug: string): ModuleSpec | undefined {
  return modules.find(m => m.slug === slug)
}
