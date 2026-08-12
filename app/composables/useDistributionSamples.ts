import type { DistributionPitch } from '~/components/pitch-distribution/core/distribution'

// 落點分布樣本的讀取層。欄位維持後端 analysis_result.json 的 snake_case，
// 交接時可直接餵後端原檔；轉成模組要的 DistributionPitch 在這層做。
//
// 注意：這份是合成樣本（600 球，見 scripts/gen-distribution-sample.mjs），
// 因為真實的 pitches.json 只有 25 球且沒有 pitcher / pitch_type 欄位。

/** public/samples/bt3d/distribution.json 的單筆 */
export interface DistributionSample {
  /** 該球的 ISO 時間戳 */
  ts: string
  /** 投手識別 */
  pitcher: string
  /** 球種代碼，如 4S / SK / SL / CB / CH，合法值見 spec/domain/pitch-types.md */
  pitch_type: string
  /** 入壘點 [x, y, z]（cm） */
  strike_zone_point: number[]
  pitch_velocity?: number | null
}

/**
 * 讀取落點分布樣本並轉成模組用的落點清單。
 * server: false — public/ 靜態檔在 dev SSR 的 nitro 內部 fetch 拿不到（404），只在 client 抓。
 */
export function useDistributionSamples() {
  const asset = useAssetUrl()
  const { data, error, status } = useFetch<DistributionSample[]>(
    asset('/samples/bt3d/distribution.json'),
    { server: false },
  )

  const pitches = computed<DistributionPitch[]>(() =>
    (data.value ?? [])
      .filter(s => Array.isArray(s.strike_zone_point) && s.strike_zone_point.length >= 3)
      .map(s => ({
        x: s.strike_zone_point[0]!,
        z: s.strike_zone_point[2]!,
        pitcher: s.pitcher,
        pitchType: s.pitch_type,
      })),
  )

  return { pitches, error, status }
}
