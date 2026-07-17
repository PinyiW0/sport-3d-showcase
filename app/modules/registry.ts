import type { ModuleSpec } from './types'
import { defineAsyncComponent } from 'vue'

// 全部 3D 研究模組的登錄表。索引頁與展示頁都讀這裡。
// baseball-spin 填實作為參考範例；其餘為規劃中（planned）骨架，
// 四個必備區塊先給文字輪廓、參考資料選填。

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
      dependencies: ['three', '@types/three（dev）', 'zod'],
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
    status: 'planned',
    summary: '把 spin_tilt 以 2D 時鐘面板呈現（源自學校 internal-project-a 案），直接 rotate(spin_tilt.degrees) 的資料視覺化，與 3D 轉軸是不同呈現。',
    tags: ['2D', 'spin-tilt', 'SVG/Canvas'],
    tech: ['SVG 或 Canvas 2D', 'Vue 3 / Nuxt 4'],
    data: {
      summary: '沿用 baseball-spin 的 spin_tilt（時鐘制 hhmm + degrees），不需 3D 姿態矩陣。',
      format: '複用 SpinResult.spinTilt（ClockValue）',
    },
    handoff: {
      files: [
        '（規劃中）2D 時鐘面板元件',
        '可參考 internal-project-a 既有實作',
      ],
      flexPoints: ['指針樣式', '面板刻度與配色'],
    },
    references: [
      { label: 'baseball-spin README §數學慣例（投影角 ≡ 90° − spin_tilt.degrees）' },
    ],
  },
  {
    slug: 'batter-pose-skeleton',
    title: '打者姿態 3D 骨架',
    sport: 'baseball',
    status: 'planned',
    summary: '以 3D 骨架重建打者揮棒姿態，供逐關節檢視與角度量測。',
    tags: ['Three.js', 'pose', 'skeleton'],
    tech: ['Three.js（骨架／關節）', '姿態估計輸出解析'],
    data: {
      summary: '每影格關節 3D 座標（世界座標）與骨架連結；需一致的座標系與出手／揮棒定義。',
      format: '（規劃中）keypoints[frame][joint] = [x, y, z]',
    },
    handoff: {
      files: ['（規劃中）3D 骨架元件 + 關節資料解析'],
      flexPoints: ['骨架拓樸', '座標系對齊', '關節配色與標籤'],
    },
  },
  {
    slug: 'pitch-trajectory',
    title: '來球 3D 軌跡圖',
    sport: 'baseball',
    status: 'planned',
    summary: '重建投球飛行 3D 軌跡，呈現軌跡曲線與進壘點。',
    tags: ['Three.js', 'trajectory', '3D'],
    tech: ['Three.js（曲線／管線）', '物理／追蹤資料解析'],
    data: {
      summary: '球體 3D 位置時間序列與進壘點；ground truth 可來自 rapsodo／trackman 或物理建模。',
      format: '（規劃中）points[t] = [x, y, z]（世界座標）+ 進壘點',
    },
    handoff: {
      files: ['（規劃中）3D 軌跡元件'],
      flexPoints: ['曲線平滑度', '進壘點標記', '相機視角'],
    },
  },
  {
    slug: 'strike-zone-grid',
    title: '九宮格落點圖',
    sport: 'baseball',
    status: 'planned',
    summary: '把進壘點投影到好球帶九宮格，呈現落點分布與統計。',
    tags: ['2D/3D', 'strike-zone', 'heatmap'],
    tech: ['SVG/Canvas 或 Three.js 平面', '落點分格統計'],
    data: {
      summary: '每球進壘點座標（好球帶平面）與分格統計。',
      format: '（規劃中）plateLocation = [x, z]，對應 3×3 分格',
    },
    handoff: {
      files: ['（規劃中）九宮格元件 + 落點統計'],
      flexPoints: ['分格邊界', '熱區配色', '單球 vs 聚合檢視'],
    },
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
