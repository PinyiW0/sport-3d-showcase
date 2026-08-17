import type { MaybeRefOrGetter } from 'vue'
import type { SmoothPreset } from '~/components/pose-metrics-chart/core/autoTuning'
import type { PoseMetrics, RawBiomech } from '~/components/pose-metrics-chart/core/types'
import { diagnoseMetrics, resolveTuning } from '~/components/pose-metrics-chart/core/autoTuning'
import { parseBiomech } from '~/components/pose-metrics-chart/core/parseBiomech'
import { metricInfo } from '~/components/pose-metrics-chart/core/types'

// 姿態生物力學樣本的讀取層。欄位維持後端 biomech.json 的 snake_case，
// 交接時可直接餵後端原檔；轉成模組要的 PoseMetrics 在這層做。
//
// 這份是真實量測資料（不是合成的），一檔一球：
// pitch_20260624_152505.265147_2a4264，748 影格、約 250fps。
// server: false — public/ 靜態檔在 dev SSR 的 nitro 內部 fetch 拿不到（404），只在 client 抓。

const SAMPLE_URL = '/samples/pose-metrics/biomech.json'

/**
 * 把「原始 JSON → 可畫的資料 → 這批資料該用什麼繪圖參數」串成一條。
 *
 * `tuning` 是重點：缺口門檻與濾波強度不寫死，每次拿到新資料都重新推導
 * （fps、缺口分布、事件間隔都會變）。詳見 `core/autoTuning.ts`。
 */
export function usePoseMetricsFrom(
  source: MaybeRefOrGetter<RawBiomech | null | undefined>,
  preset: MaybeRefOrGetter<SmoothPreset> = 'mid',
) {
  const metrics = computed<PoseMetrics>(() => parseBiomech(toValue(source) ?? {}))
  const diagnostics = computed(() => diagnoseMetrics(metrics.value, key => metricInfo(key).wraps === true))
  const tuning = computed(() => resolveTuning(diagnostics.value, toValue(preset)))

  return { metrics, diagnostics, tuning }
}

/** 讀專案內建的樣本；接真 API 時改用 `usePoseMetricsFrom` 餵回應即可 */
export function usePoseMetrics(preset: MaybeRefOrGetter<SmoothPreset> = 'mid') {
  const asset = useAssetUrl()
  const { data, error, status } = useFetch<RawBiomech>(asset(SAMPLE_URL), { server: false })

  return { ...usePoseMetricsFrom(data, preset), error, status }
}
