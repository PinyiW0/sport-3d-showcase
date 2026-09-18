#!/usr/bin/env node
// 明文洩漏掃描——把受保護內容的散文片段當指紋，逐條掃 nuxt generate 的產物。
//
// 守的是 protected-content-check.mjs 守不到的那一半：那支只檢查 registry 有沒有帶
// 受保護欄位，但同一段文字如果被複製到某個 .vue 元件裡寫死，照樣會進 bundle。
//
// 需要本機明文，所以不進 npm run eslint（CI 是 fresh checkout，沒有明文）。
// 用法：npm run generate && npm run protect:leakscan
//
// 只取散文型欄位（summary／flexPoints／files／limitations／references.label）當指紋：
// 資料欄位名（omega_rad_per_frame 之類）本來就存在於 public/samples/ 的公開樣本裡，拿來比會全是誤報。

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

const PLAIN_PATH = 'protected/modules.plain.json'
const DIST_DIR = '.output/public'
// 密文檔本身當然含有受保護內容（那是它的工作），不列入掃描
const SKIP_PATHS = ['protected/modules.enc.json']
// 指紋長度：太短會誤中通用技術詞，24 字對中文散文足夠獨特
const PROBE_LEN = 24

// 已確認可以重疊的片段。
//
// 公開文案與受保護內容描述的是同一個模組，字面重疊本來就會發生。
// 這支腳本的價值不是「零重疊」，是「每一處重疊都有人看過並判斷過」。
// 要加進來的條件：那段文字不含內部資訊（內部研究筆記出處、事件編號、
// 具體待確認的異常數值、內部流程狀態），而且訪客確實需要它才看得懂畫面。
//
// 加白名單前先問自己：這句話讓訪客知道了什麼？如果答案裡有任何一項是
// 「原本只有解鎖後才該知道的事」，那就該改文案，不是加白名單。
const ALLOWED = [
  {
    slug: 'landing-field-chart',
    field: 'limitations',
    startsWith: '預測飛行距離只用擊球初速與出射角推算',
    // 落點圖的公開說明也講了這件事。這是看懂圖表的必要前提——不講，
    // 訪客會把粗估的飛行距離當成精算值。不含內部研究出處與異常事件編號。
    reason: '看懂落點圖的必要前提，公開文案已移除內部研究出處與事件編號',
  },
  {
    slug: 'pitch-distribution',
    field: 'handoff.files',
    startsWith: 'scripts/gen-distribution',
    // 分布圖的公開說明註明樣本是合成的、由哪支腳本產生。
    // scripts/ 目錄本來就在公開 repo 裡，藏這個路徑沒有意義，
    // 而不講會讓訪客誤以為那 600 球是實測資料。
    reason: '樣本為合成資料的必要揭露，腳本路徑本來就公開在 repo 裡',
  },
]

function isAllowed(slug, field, text) {
  return ALLOWED.some(a => a.slug === slug && a.field === field && text.startsWith(a.startsWith))
}

let plain
try {
  plain = JSON.parse(await readFile(PLAIN_PATH, 'utf8'))
}
catch {
  console.log(`找不到 ${PLAIN_PATH}，略過洩漏掃描（本機跑 npm run protect:decrypt 取得明文）`)
  process.exit(0)
}

try {
  await stat(DIST_DIR)
}
catch {
  console.error(`找不到 ${DIST_DIR}——先跑 npm run generate 再掃`)
  process.exit(1)
}

// 從明文抽出散文型指紋
const probes = []
for (const [slug, content] of Object.entries(plain)) {
  const texts = [
    ['data.summary', content.data?.summary],
    ...(content.handoff?.files ?? []).map(v => ['handoff.files', v]),
    ...(content.handoff?.flexPoints ?? []).map(v => ['handoff.flexPoints', v]),
    ...(content.limitations ?? []).map(v => ['limitations', v]),
    ...(content.references ?? []).map(r => ['references.label', r.label]),
  ]
  for (const [field, text] of texts) {
    const trimmed = String(text ?? '').trim()
    if (trimmed.length >= PROBE_LEN && !isAllowed(slug, field, trimmed))
      probes.push({ slug, field, probe: trimmed.slice(0, PROBE_LEN) })
  }
}

// 遞迴收集產物檔案
async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory())
      out.push(...await walk(path))
    else if (!SKIP_PATHS.some(skip => path.endsWith(skip)))
      out.push(path)
  }
  return out
}

const files = await walk(DIST_DIR)
const leaks = []
for (const file of files) {
  const body = await readFile(file, 'utf8').catch(() => '')
  if (!body)
    continue
  for (const { slug, field, probe } of probes) {
    if (body.includes(probe))
      leaks.push({ slug, field, probe, file })
  }
}

if (leaks.length > 0) {
  console.error(`明文洩漏掃描失敗：受保護內容出現在 ${leaks.length} 處建置產物裡\n`)
  for (const { slug, field, probe, file } of leaks)
    console.error(`  [${slug}] ${field}「${probe}…」\n      → ${file}`)
  console.error('\n這段文字多半也被寫死在某個 .vue 元件裡；同一件事只該留一份，公開文案不要照抄受保護內容。')
  process.exit(1)
}

console.log(`明文洩漏掃描通過（${probes.length} 條指紋 × ${files.length} 個產物檔，零命中；另有 ${ALLOWED.length} 條已確認的合法重疊見腳本內 ALLOWED）`)
