import type { MaybeRefOrGetter } from 'vue'
import type { RawBpeIndexEntry, RawBpeOverviewEntry } from '~/components/bpe-data/core/types'
import { parseBpeResult } from '~/components/bpe-data/core/parseBpeResult'

// 全部事件的精簡結果：擊球點九宮格與球場圖把其他事件疊在同一張圖上時用。
//
// 讀 overview.json（每筆拿掉骨架與動畫，23 筆約 33KB），不必把 3.6MB 的完整檔全抓下來。
// 每筆照樣過 parseBpeResult 的檢查關卡與缺值規則，跟單筆檢視同一套判斷。
// server: false 的理由同 useBpeEvents：public/ 靜態檔在 dev SSR 拿不到。

const OVERVIEW_URL = '/samples/bpe/overview.json'

/**
 * @param entries index.json 的事件清單。兩份檔案由同一支腳本依同一順序寫出，
 * 仍逐筆比對 event_id，對不上的那筆不回傳，免得把 A 事件的點標成 B 事件
 */
export function useBpeOverview(entries: MaybeRefOrGetter<readonly RawBpeIndexEntry[]>) {
  const asset = useAssetUrl()
  const { data } = useFetch<RawBpeOverviewEntry[]>(asset(OVERVIEW_URL), { server: false })

  return computed(() => {
    const list = toValue(entries)
    if (!Array.isArray(data.value))
      return []
    return data.value.flatMap((item, index) =>
      list[index]?.event_id === item.event_id ? [{ index, outcome: parseBpeResult(item.result) }] : [],
    )
  })
}
