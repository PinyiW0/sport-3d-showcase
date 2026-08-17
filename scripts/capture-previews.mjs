#!/usr/bin/env node
/**
 * 產生索引頁卡片用的模組預覽：每個模組一段 webm（hover 播放）+ 一張 poster jpg。
 *
 * 用法（需要先啟動 dev server）：
 *   npm run dev
 *   npm run capture:previews                      # 全部重錄，預設打 http://localhost:3000
 *   npm run capture:previews -- strike-zone-grid  # 只錄指定模組（可給多個）
 *   PREVIEW_BASE_URL=http://localhost:3004 npm run capture:previews
 *
 * 只改了一個模組時務必指定 slug——全部重錄會讓其他模組的 webm 產生無謂的 diff。
 * 例外：動到 SIZE / SCALE / CRF 這類輸出規格時要全部重錄，否則卡片牆上會出現
 * 有的清晰、有的模糊的混搭。
 *
 * 錄的是 /preview/[slug]（只渲染呈現本體、不含控制列），錄完用 ffmpeg 裁掉載入片頭。
 * 新增模組時，先讓該 slug 在 preview 頁渲染得出來，再把 slug 加進下面的 MODULES。
 */
import { execFile } from 'node:child_process'
import { mkdir, readdir, rm, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import { chromium } from 'playwright-core'

const run = promisify(execFile)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public/previews')
const TMP_DIR = join(ROOT, 'node_modules/.cache/preview-capture')

const BASE_URL = process.env.PREVIEW_BASE_URL ?? 'http://localhost:3000'
/** preview 頁的基準尺寸（16:10，對齊卡片的 aspect-16/10）。 */
const BASE_SIZE = { width: 480, height: 300 }
/**
 * 輸出倍率。卡片在版面上約 520px 寬，Retina（dpr 2）下等於 1040 實體像素，
 * 480 寬的素材會被放大兩倍以上，hover 播放時糊得很明顯。
 *
 * 三處必須一致：viewport 尺寸、`recordVideo.size`、preview 頁的 `?scale=`。
 * - viewport 要放大：Playwright 的 `recordVideo.size` 只會把畫面縮小塞進指定
 *   尺寸、不會放大，viewport 沒跟著放大就會錄出「畫面在左上角、其餘補灰」
 * - `?scale=` 讓頁面用 CSS zoom 放大，3D 元件的 clientWidth 維持 480，
 *   線寬（像素單位）相對畫面的比例才不會被稀釋
 * - deviceScaleFactor 讓 canvas buffer 跟著加倍，zoom 放大後才不會糊
 */
const SCALE = 2
const SIZE = { width: BASE_SIZE.width * SCALE, height: BASE_SIZE.height * SCALE }

/** 每段錄影長度（毫秒）。bt3d 輪播 500ms/球，4 秒約看到 8 球。 */
const RECORD_MS = 4000
/**
 * 內容就緒後、開始錄之前的緩衝：讓 3D 場景把第一幀畫穩。
 * 1600 而非 800——ready 只表示資料到手，SwiftShader 軟體渲染下 WebGL 場景
 * 還要再畫上一秒，太早截圖會拍到全空的畫布。
 */
const SETTLE_MS = 1600

const MODULES = [
  'baseball-spin',
  'clock-spin',
  'pitch-pose-skeleton',
  'pitch-pose-human',
  'pitch-trajectory',
  'strike-zone-grid',
  'pitch-distribution',
  'pose-metrics-chart',
]

/**
 * headless Chromium 預設拿不到 GPU，WebGL context 會建立失敗——three.js 直接報錯
 * （Plotly 的 scatter3d 也會退成 "WebGL is not supported"）。
 * 用 SwiftShader 走軟體渲染補上（慢但畫得出來）。
 */
const WEBGL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
]

/** Nuxt devtools 的浮動列會被錄進畫面，錄製時蓋掉。 */
const HIDE_DEVTOOLS_CSS = `
  #nuxt-devtools-anchor,
  #nuxt-devtools-container,
  [data-v-inspector-container] { display: none !important; }
`

async function capture(browser, slug) {
  const startedAt = Date.now()
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: SCALE,
    recordVideo: { dir: TMP_DIR, size: SIZE },
  })
  const page = await context.newPage()

  const errors = []
  page.on('pageerror', err => errors.push(err.message))

  // scale 要與 viewport 的倍率一致，頁面才會鋪滿整個畫布
  await page.goto(`${BASE_URL}/preview/${slug}?scale=${SCALE}`, { waitUntil: 'domcontentloaded' })
  // 資料 fetch 與 3D 初始化都在 client 端，等元件自己回報就緒
  await page.waitForSelector('[data-preview-ready="true"]', { timeout: 45_000 })
  await page.addStyleTag({ content: HIDE_DEVTOOLS_CSS })
  await page.waitForTimeout(SETTLE_MS)

  // SwiftShader 畫得出來但很慢；確認真的有 WebGL 再往下錄，否則錄到的是空畫面
  const hasWebgl = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  })
  if (!hasWebgl)
    throw new Error('WebGL context 建立失敗——3D 內容會錄成空白')

  await page.screenshot({
    path: join(OUT_DIR, `${slug}.jpg`),
    type: 'jpeg',
    quality: 82,
  })

  // 錄影從 context 建立就開始，這段是資料 fetch 與 3D 初始化的空白畫面，錄完要裁掉
  const contentStartSec = (Date.now() - startedAt) / 1000

  await page.waitForTimeout(RECORD_MS)

  const rawPath = await page.video().path()
  await context.close() // 影片要等 context 關掉才寫完整

  await trimHead(rawPath, join(OUT_DIR, `${slug}.webm`), contentStartSec)
  await unlink(rawPath)

  if (errors.length)
    console.warn(`  ⚠ ${slug} 有 page error：${errors.slice(0, 2).join(' / ')}`)

  return { slug, trimmedSec: Number(contentStartSec.toFixed(2)) }
}

/**
 * 裁掉片頭並重新編碼成乾淨的循環素材。
 * -ss 放在 -i 前面是輸入端 seek（快）。
 * CRF 30 而非 34：解析度拉到 2x 後，34 的量化雜訊在細線條（骨架、九宮格、軸刻度）
 * 上很明顯，等於白做了解析度。30 換來的檔案增量對幾秒的小片段可以接受。
 */
async function trimHead(input, output, startSec) {
  await run(ffmpegPath, [
    '-y',
    '-ss',
    startSec.toFixed(2),
    '-i',
    input,
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '30',
    '-b:v',
    '0',
    '-an', // 沒有音軌
    '-row-mt',
    '1',
    output,
  ])
}

async function main() {
  const requested = process.argv.slice(2)
  const unknown = requested.filter(slug => !MODULES.includes(slug))
  if (unknown.length) {
    // 打錯 slug 要噴錯,不能靜默跳過——否則會以為錄好了
    throw new Error(`未知的模組：${unknown.join('、')}\n可用：${MODULES.join('、')}`)
  }
  const targets = requested.length ? requested : MODULES

  await mkdir(OUT_DIR, { recursive: true })
  await rm(TMP_DIR, { recursive: true, force: true })
  await mkdir(TMP_DIR, { recursive: true })

  const browser = await chromium.launch({ args: WEBGL_ARGS })
  try {
    for (const slug of targets) {
      process.stdout.write(`錄製 ${slug} … `)
      const { trimmedSec } = await capture(browser, slug)
      console.log(`完成（裁掉 ${trimmedSec}s 片頭）`)
    }
  }
  finally {
    await browser.close()
    await rm(TMP_DIR, { recursive: true, force: true })
  }

  const files = await readdir(OUT_DIR)
  console.log(`\n輸出到 public/previews/（${files.length} 個檔案）`)
}

main().catch((err) => {
  console.error('\n錄製失敗：', err.message)
  console.error('確認 dev server 已啟動，且 PREVIEW_BASE_URL 指向正確的 port。')
  process.exitCode = 1
})
