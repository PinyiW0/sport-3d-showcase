#!/usr/bin/env node
/**
 * 把演算法端交付的 BPE 揮棒結果參考包匯入成本專案樣本（public/samples/bpe/）。
 *
 * 用法：
 *   node scripts/import-bpe-samples.mjs <參考包的 algorithm 目錄>
 *   node scripts/import-bpe-samples.mjs ~/Desktop/workplace/baseball-punch/reference/algorithm
 *
 * 讀 events/index.json 與其列出的每一筆 events/<event_id>.json，
 * 去掉縮排空白後原樣寫出。欄位與數值一律不改——原檔每筆約 550KB，
 * 其中約七成是縮排與換行，改成單行後約 160KB，23 筆合計約 3.6MB。
 *
 * 另外寫一份 overview.json：每筆同一份結果、只拿掉 payload 裡的 skeleton 與 animation
 * （九成以上的體積），其餘欄位原樣保留。擊球點九宮格與球場圖把全部事件疊在同一張圖上時讀這份，
 * 不必把 23 筆完整檔（3.6MB）全抓下來；前端照樣過 parseBpeResult 的檢查關卡。
 *
 * 參考包不進版控（交付包是唯讀參考），換一批資料就重跑這支。
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/samples/bpe')

const source = process.argv[2]
if (!source) {
  console.error('用法：node scripts/import-bpe-samples.mjs <參考包的 algorithm 目錄>')
  process.exit(1)
}

const eventsDir = join(source, 'events')
const index = JSON.parse(await readFile(join(eventsDir, 'index.json'), 'utf8'))
if (!Array.isArray(index) || index.length === 0) {
  console.error(`${eventsDir}/index.json 不是非空陣列`)
  process.exit(1)
}

// 先清掉舊的 events/，避免上一批留下 index.json 已不列出的孤兒檔
await rm(join(OUT_DIR, 'events'), { recursive: true, force: true })
await mkdir(join(OUT_DIR, 'events'), { recursive: true })

/**
 * 單行、但照專案 eslint 的 JSON 排版規則留空白（物件大括號內側與逗號、冒號後各一格，
 * 陣列括號內側不留）——與既有樣本 public/samples/pose3d/outcome.json 同一種寫法。
 * 用 JSON.stringify 的純壓縮輸出會讓 npm run eslint 報出幾十萬個排版錯誤。
 */
function compactJson(value) {
  if (Array.isArray(value))
    return `[${value.map(compactJson).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0)
      return '{}'
    return `{ ${entries.map(([key, v]) => `${JSON.stringify(key)}: ${compactJson(v)}`).join(', ')} }`
  }
  return JSON.stringify(value)
}

/** 結果檔去掉骨架與動畫：payload 不是物件（檢查關卡會擋下的檔）就原樣保留，不替它判斷 */
function withoutAnimation(envelope) {
  const payload = envelope?.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
    return envelope
  const { skeleton: _skeleton, animation: _animation, ...rest } = payload
  return { ...envelope, payload: rest }
}

let total = 0
const overview = []
for (const entry of index) {
  const raw = await readFile(join(eventsDir, `${entry.event_id}.json`), 'utf8')
  const envelope = JSON.parse(raw)
  const compact = `${compactJson(envelope)}\n`
  await writeFile(join(OUT_DIR, 'events', `${entry.event_id}.json`), compact)
  total += compact.length
  overview.push({ event_id: entry.event_id, result: withoutAnimation(envelope) })
}
await writeFile(join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
// 一筆一行：整份單行時 diff 看不出是哪一筆變了
await writeFile(join(OUT_DIR, 'overview.json'), `[\n${overview.map(item => `  ${compactJson(item)}`).join(',\n')}\n]\n`)

console.log(`已匯入 ${index.length} 筆到 public/samples/bpe/（events 合計 ${(total / 1024 / 1024).toFixed(2)} MB）`)
