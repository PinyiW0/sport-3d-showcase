import type { RawBpeEnvelope, RawBpeIndexEntry } from '~/components/bpe-data/core/types'
import { parseBpeResult } from '~/components/bpe-data/core/parseBpeResult'

// BPE 揮棒結果樣本的讀取層：打擊姿態、擊球點九宮格、預測落點球場圖三個模組共用。
//
// 樣本是演算法端 2026-09-07 參考包的 23 筆龍潭實測，原檔只去掉縮排
// （scripts/import-bpe-samples.mjs）。一筆約 160KB，切換事件時才載入該筆。
// server: false — public/ 靜態檔在 dev SSR 的 nitro 內部 fetch 拿不到（404），只在 client 抓。

const INDEX_URL = '/samples/bpe/index.json'

/**
 * @param initial 預設選第幾筆（index.json 的陣列索引，與參考實作網址的 hash 同一套編號）
 */
export function useBpeEvents(initial = 0) {
  const asset = useAssetUrl()

  const { data: index, error: indexError } = useFetch<RawBpeIndexEntry[]>(asset(INDEX_URL), { server: false })
  const entries = computed(() => (Array.isArray(index.value) ? index.value : []))

  const selected = ref(initial)
  const entry = computed(() => entries.value[selected.value] ?? null)

  // 事件清單到手前還不知道要抓哪一筆，所以 immediate: false，改由下面的 watch 觸發第一次。
  // 之後換事件時 useFetch 會因網址（= key）改變自動重抓；抓失敗後再換事件則靠 watch 補抓
  const eventUrl = computed(() => asset(`/samples/bpe/events/${entry.value?.event_id ?? ''}.json`))
  const { data: raw, error: eventError, status, execute } = useFetch<RawBpeEnvelope>(eventUrl, {
    server: false,
    immediate: false,
  })
  watch(
    () => entry.value?.event_id,
    (id) => {
      if (id && status.value === 'idle')
        execute()
    },
    { immediate: true },
  )

  /** 檢查關卡的結果；尚未載入時為 null。換事件的載入期間仍是前一筆，直到新的一筆到手 */
  const outcome = computed(() => (raw.value ? parseBpeResult(raw.value) : null))

  const error = computed(() => indexError.value ?? eventError.value ?? null)

  return { entries, selected, entry, outcome, status, error }
}
