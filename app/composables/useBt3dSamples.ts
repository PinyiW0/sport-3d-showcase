import type { PitchAnalysisResult, Point3D } from '~/components/pitch-trajectory-data/core/trajectoryGeometry'
import { parsePitchTrajectory } from '~/components/pitch-trajectory-data/core/trajectoryGeometry'

// bt3d 樣本包的讀取層：pitch-trajectory 與 strike-zone-grid 兩個模組共用同一份 25 球資料。
// 欄位維持後端 analysis_result.json 的 snake_case，交接時可直接餵後端原檔。

/** public/samples/bt3d/pitches.json 的單筆（後端 analysis_result.json 的畫圖欄位子集） */
export interface Bt3dSample extends PitchAnalysisResult {
  /** 該球的 ISO 時間戳（原本是資料夾名） */
  ts: string
  horizontal_offset?: number | null
  vertical_offset?: number | null
}

export interface Bt3dPitch {
  index: number
  ts: string
  /** HH:MM:SS */
  time: string
  trajectory: Point3D[]
  /** 入壘點 [x, y, z]（cm） */
  strikeZonePoint: Point3D
  velocity: number | null
}

/**
 * 讀取 bt3d 樣本包並轉成頁面用的球列表（依時間排序）。
 * server: false — public/ 靜態檔在 dev SSR 的 nitro 內部 fetch 拿不到（404），只在 client 抓。
 */
export function useBt3dSamples() {
  const asset = useAssetUrl()
  const { data, error, status } = useFetch<Bt3dSample[]>(asset('/samples/bt3d/pitches.json'), {
    server: false,
  })

  const pitches = computed<Bt3dPitch[]>(() =>
    (data.value ?? [])
      .map(sample => ({
        ts: sample.ts,
        time: sample.ts.slice(11, 19),
        trajectory: parsePitchTrajectory(sample),
        strikeZonePoint: sample.strike_zone_point as Point3D,
        velocity: sample.pitch_velocity ?? null,
      }))
      .filter(pitch => pitch.trajectory.length >= 2)
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .map((pitch, index) => ({ ...pitch, index })),
  )

  return { pitches, error, status }
}
