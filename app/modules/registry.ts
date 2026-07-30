import type { ModuleSpec } from './types'
import { defineAsyncComponent } from 'vue'

// 全部 3D 研究模組的登錄表。索引頁與展示頁都讀這裡。
// done  = 研究告一段落（baseball-spin、pitch-pose-skeleton、pitch-trajectory）
// wip   = 有可運作實作可點進去看，但還在調整
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
    status: 'wip',
    summary: '把 spin_tilt 以 2D 時鐘面板呈現（源自學校 internal-project-a 案）：盤面靜態、指針整組 rotate(spin_tilt.degrees)。與 baseball-spin 的 3D 指針是同一份資料的兩種呈現。',
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
        '指針樣式 pointer：chevron（project-c，V 形沿軸排列）／arrow（project-a，單一實心箭頭）',
        '盤面配色與半徑（core/clock-geometry.ts 的 cx/cy/radius）',
        '標籤列文字（label prop，預設「轉軸方向」）',
        '要讓箭頭與標籤同側就傳 degrees - 180（元件不做換算）',
      ],
    },
    references: [
      { label: '盤面來源：internal-project-a @ feature/#23-spin-tilt-clock（PitchDetailView.vue 內嵌 SVG）' },
      { label: '指針樣式來源：兩種並存——internal-project-c @ main（chevron）與 internal-project-a（arrow），由 pointer prop 切換' },
      { label: '資料慣例：degrees 比自己的 hhmm 多約 180°、且未正規化到 0–360，詳見模組 README' },
      { label: 'baseball-spin README §數學慣例（投影角 ≡ 90° − spin_tilt.degrees）' },
    ],
  },
  {
    slug: 'pitch-pose-skeleton',
    title: '投球姿態 3D 骨架',
    sport: 'baseball',
    status: 'done',
    summary: '把多鏡位重建的 COCO-17 骨架逐幀播放，用 Plotly scatter3d 畫點線圖；軸範圍與視角固定，播放中空間不會跟著資料「呼吸」、拖曳過的視角也不被重設。',
    tags: ['Plotly', 'pose', 'skeleton', 'COCO-17'],
    updated: '2026-07',
    demoRoute: '/pose3d-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/PitchPoseSkeletonShowcase.vue')),
    tech: [
      'Plotly.js（plotly.js-dist-min，scatter3d）',
      'COCO-17 骨架拓樸（19 條骨頭）',
      'rAF 播放時鐘（0.05–1× 可調）',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '單球約 3 秒、250fps 的多鏡位 3D 重建骨架：每幀 17 個 COCO keypoint 的世界座標（cm），外加出手瞬間的 frame index。',
      format: 'PitchPose3d（core/parsePitchOutcome.ts；wire 為 outcome.json 的 clip.frames[].reconstruction.pose_3d）',
      sample: POSE3D_SAMPLE,
      sampleUrl: 'public/samples/pose3d/outcome.json（749 frames，0.7MB）',
    },
    handoff: {
      files: [
        'app/components/pitch-pose/（整包 cp 即可，含單元測試；骨架版最小集是 Pose3dSkeleton.vue + core/{parsePitchOutcome,findPoseFrame,types}.ts）',
        'app/composables/usePose3dClip.ts（樣本載入 + 播放時鐘）',
        'public/samples/pose3d/outcome.json',
        'app/types/plotly.d.ts（plotly.js-dist-min 沒附型別）',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'plotly.js-dist-min', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '骨架顏色 color、畫布高度 height',
        '播放速率（usePose3dClip 的 rate，預設 0.25×）',
        '資料空洞容忍值 DEFAULT_MAX_GAP_MS（預設 250ms）',
        '骨架拓樸 SKELETON_EDGES（core/types.ts，換 keypoint 定義時改這裡）',
      ],
    },
    references: [
      { label: '來源：internal-template @ feature/strike-zone（doc/pose3d.md）' },
      { label: 'COCO-17 keypoint 定義（mmpose）', href: 'https://mmpose.readthedocs.io/en/latest/dataset_zoo/2d_body_keypoint.html#coco' },
    ],
  },
  {
    slug: 'pitch-pose-human',
    title: '投球姿態 3D 真人模型',
    sport: 'baseball',
    status: 'wip',
    summary: '同一份 COCO-17 骨架，改用 three.js 把 keypoints retarget 到人形 glTF 模型驅動骨骼。目前是可運作的初版：手腕、脊椎等 COCO-17 沒有的關節為近似值，three.js 路線仍在研究調整中。',
    tags: ['Three.js', 'pose', 'retarget', 'glTF'],
    updated: '2026-07',
    demoRoute: '/pose3d-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/PitchPoseHumanShowcase.vue')),
    tech: [
      'Three.js（GLTFLoader、OrbitControls、Quaternion retarget）',
      'Xbot.glb（three.js 官方範例人形骨架）',
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
        'app/components/pitch-pose/（整包 cp 即可，含單元測試；真人版另需 Pose3dHuman.vue + core/pose3dRetarget.ts）',
        'app/composables/usePose3dClip.ts（樣本載入 + 播放時鐘）',
        'public/models/Xbot.glb（人形骨架模型，2.8MB）',
        'public/samples/pose3d/outcome.json',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'three', '@types/three（dev）', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '人形模型可換（骨骼命名須對得上 retarget 對照表）',
        '模型縮放依腿長中位數自動推估，可改為固定值',
        'OrbitControls 初始視角與畫布高度 height',
      ],
    },
    references: [
      { label: '來源：internal-template @ feature/strike-zone（doc/pose3d.md）' },
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
    tech: ['沿用 pitch-pose 的 Plotly／Three.js 骨架渲染', '打者姿態估計輸出解析'],
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
    summary: '用 Plotly 在同一個 3D 場景畫出投球軌跡、本壘板實體與好球帶九宮格；暗色主題沿用 project-b 鷹眼系統配色，軸範圍則依軌跡動態換算成等比例，1cm 在三軸的視覺長度一致、空間不變形。',
    tags: ['Plotly', 'trajectory', '3D', 'mesh3d'],
    updated: '2026-07',
    demoRoute: '/pitch3d-demo',
    presentation: defineAsyncComponent(() => import('~/components/modules/PitchTrajectoryShowcase.vue')),
    tech: [
      'Plotly.js（plotly.js-dist-min，scatter3d + mesh3d）',
      '暗色主題（黑底 + 琥珀黃軌跡，取自 project-b 鷹眼系統）',
      '本壘板五邊形自動生成側面與底面',
      '等比 aspectratio 換算（每 200cm 對應 1 視覺單位）',
      'Vue 3 / Nuxt 4',
    ],
    data: {
      summary: '每球的擬合軌跡點（20 點，cm）與入壘點；好球帶框不在資料裡，由固定 175cm 身高比例推算。',
      format: 'PitchAnalysisResult（core/usePitch3d.ts；wire 為後端 analysis_result.json 的 snake_case 子集）',
      sample: BT3D_SAMPLE,
      sampleUrl: 'public/samples/bt3d/pitches.json（25 球合併，18KB）',
    },
    handoff: {
      files: [
        'app/components/pitch-trajectory/（整包 cp，含 core/ 純 TS 零 Vue 依賴與其單元測試）',
        'app/components/baseball-field/（場地與好球帶常數的單一來源，必須一併帶走）',
        'app/composables/useBt3dSamples.ts（樣本讀取，與 strike-zone-grid 共用）',
        'public/samples/bt3d/pitches.json',
        'app/types/plotly.d.ts（plotly.js-dist-min 沒附型別）',
      ],
      dependencies: ['Nuxt 4（元件靠 auto-import 取得 ref/onMounted 等，非 Nuxt 環境需自行補 import）', 'plotly.js-dist-min', 'tailwindcss（元件的 class 樣式）'],
      flexPoints: [
        '相機距離 zoom（>1 拉遠、<1 放大）與完整視角覆寫 cameraEye',
        '打者身高 batterHeightCm（推算九宮格上下緣，預設 175）',
        '畫布 width／height（Plotly 需固定尺寸）',
        '整套配色集中在 core/usePitch3d.ts 的 CHART_THEME（換主題只動這一組常數）',
      ],
    },
    references: [
      { label: '來源：internal-template @ feature/strike-zone（doc/pitch3d.md）' },
      { label: '配色來源：internal-project-b（內部系統 BaseballChart.vue）' },
      { label: '座標系：原點為本壘板尖端、y 正向朝投手、單位 cm' },
    ],
  },
  {
    slug: 'strike-zone-grid',
    title: '九宮格落點圖',
    sport: 'baseball',
    status: 'wip',
    summary: '把入壘點投影到好球帶九宮格的純 SVG 呈現，含好壞球幾何判定與本壘板、打擊區的透視底座；縮放為真實比例等比換算，不會把好球帶畫扁。呈現細節仍在調整中。',
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
        '打者級別 BATTER_LEVELS（少棒 134.3／青少棒 156.5／青棒 169.7／成棒 172 cm，只改好球帶上下緣）',
      ],
    },
    references: [
      { label: '來源：internal-template @ feature/strike-zone（doc/bt3d.md）' },
      { label: '座標：px = 距本壘板中心水平位移、pz = 離地高度，單位英尺' },
      { label: '場地與好球帶規格：spec/domain/baseball-field-coordinates.md（§5 為打者級別與代表身高的推導）' },
    ],
  },
  {
    slug: 'pitch-distribution',
    title: '落點分布圖',
    sport: 'baseball',
    status: 'wip',
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
    title: '姿態數據線性圖',
    sport: 'baseball',
    status: 'planned',
    summary: '把姿態衍生數據（關節角度、角速度等）以時間軸折線圖呈現，可與 3D 骨架連動。',
    tags: ['charts', 'line-chart', 'pose'],
    tech: ['chart.js / vue-chartjs（見 ui-config additionalFeatures）', 'Vue 3'],
    data: {
      summary: '每影格的純量指標序列（如關節角度、角速度）。',
      format: '（規劃中）series[metric][frame] = number',
    },
    handoff: {
      files: ['（規劃中）折線圖元件'],
      flexPoints: ['指標選擇', '時間軸縮放', '與 3D 骨架的游標連動'],
    },
  },
]

export function findModule(slug: string): ModuleSpec | undefined {
  return modules.find(m => m.slug === slug)
}
