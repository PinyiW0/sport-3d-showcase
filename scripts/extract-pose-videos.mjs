#!/usr/bin/env node
/**
 * 從演算法交付包抽出三機影片，重壓成瀏覽器播得動、拖得順的樣本。
 *
 * 用法：
 *   node scripts/extract-pose-videos.mjs          # 三機都產
 *   node scripts/extract-pose-videos.mjs HB 3B    # 只產指定機位
 *
 * 為什麼需要這支腳本（而不是直接把交付的 mp4 複製過去）：
 *
 * 1. 交付包裡的 `pitch_*_{1B,3B,HB}.mp4` 編碼是 **mp4v（MPEG-4 Part 2）**，
 *    Chrome／Safari 都不支援，`<video>` 放不出來。
 * 2. 同一份影片的 **H.264 版本藏在 `pitch_4panel.html` 裡**（base64 內嵌），
 *    那才是可用的來源——748 影格 @ 30fps，與 biomech.json 的 frame_count 一致。
 * 3. 但內嵌那版每支只有 **3 個關鍵影格**，拖曳時間軸時瀏覽器得從關鍵影格往下
 *    解上百格才畫得出目標格，會明顯卡頓。所以要重壓成密關鍵影格（-g 10）。
 *
 * 交付包本身被 gitignore（124 MB），所以產物進版控、腳本也進版控——
 * 沒有這支腳本就沒人重製得出 public/samples/pose-metrics/videos/。
 * 包裡有什麼見 doc/投手姿態frame.md。
 */
import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const run = promisify(execFile)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_HTML = join(ROOT, 'doc/投手姿態frame/pitch_4panel.html')
const OUT_DIR = join(ROOT, 'public/samples/pose-metrics/videos')
const TMP_DIR = join(ROOT, 'node_modules/.cache/pose-video-extract')

/** 交付影片的編碼影格率。與擷取的 ~250fps 無關——影片是慢動作重編碼 */
const FPS = 30
/** 影格數的期望值（= biomech.json 的 frame_count）。對不上就是對位壞了，直接失敗 */
const EXPECTED_FRAMES = 748
/** 三支合計的預算。超過就調 CRF 再跑一次 */
const TOTAL_BUDGET_MB = 8

/**
 * 重壓參數。三個關鍵：
 * - `-g 10`：關鍵影格從 3 個變 75 個，拖曳才跟得上（這是重壓的主要理由）
 * - `-r 30 -fps_mode cfr`：保證輸出仍是 748 格，影格 1:1 對位不能被丟格破壞
 * - `-an`：來源沒有音軌，明確去掉免得產生空音軌
 */
const CRF = Number(process.env.POSE_VIDEO_CRF ?? 28)
const SCALE_WIDTH = Number(process.env.POSE_VIDEO_WIDTH ?? 720)

const CAMERAS = ['3B', 'HB', '1B']

/** 內嵌影片長這樣：`<video id=vHB playsinline preload=auto src="data:video/mp4;base64,…">` */
const EMBEDDED_VIDEO = /<video id=v([A-Z0-9]+) [^>]*src="data:video\/mp4;base64,([A-Z0-9+/=]+)"/gi
/** ffmpeg 進度行的影格計數，取最後一次即總影格數 */
const FRAME_PROGRESS = /frame=\s*(\d+)/g

async function extractBase64() {
  let html
  try {
    html = await readFile(SOURCE_HTML, 'latin1')
  }
  catch {
    throw new Error(
      `找不到交付包：${SOURCE_HTML}\n`
      + '原始包（124 MB）不進版控，請先向演算法端取得並放回 doc/投手姿態frame/。\n'
      + '包內容與欄位定義見 doc/投手姿態frame.md',
    )
  }

  const found = new Map()
  for (const [, cam, base64] of html.matchAll(EMBEDDED_VIDEO))
    found.set(cam, Buffer.from(base64, 'base64'))

  if (!found.size)
    throw new Error(`${SOURCE_HTML} 裡找不到內嵌影片，交付格式可能變了`)

  return found
}

/** 分組寫再攤平，比一個旗標一行看得出哪些參數是一組的 */
function encodeArgs() {
  return [
    `-vf scale=${SCALE_WIDTH}:-2`,
    '-c:v libx264 -profile:v main -pix_fmt yuv420p',
    `-crf ${CRF}`,
    '-g 10 -keyint_min 10 -sc_threshold 0',
    `-fps_mode cfr -r ${FPS}`,
    '-movflags +faststart -an',
  ].join(' ').split(' ')
}

/** 用 null muxer 跑一遍數影格——ffmpeg-static 不含 ffprobe，這是最省事的算法 */
async function countFrames(file) {
  const { stderr } = await run(ffmpegPath, ['-hide_banner', '-i', file, '-map', '0:v:0', '-f', 'null', '-'])
  const matches = [...stderr.matchAll(FRAME_PROGRESS)]
  return matches.length ? Number(matches.at(-1)[1]) : 0
}

async function main() {
  const wanted = process.argv.slice(2).filter(arg => CAMERAS.includes(arg))
  const cameras = wanted.length ? wanted : CAMERAS

  const blobs = await extractBase64()
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(TMP_DIR, { recursive: true })

  let totalBytes = 0
  for (const cam of cameras) {
    const blob = blobs.get(cam)
    if (!blob) {
      console.error(`✗ ${cam}：交付包裡沒有這個機位`)
      process.exitCode = 1
      continue
    }

    const raw = join(TMP_DIR, `${cam}.raw.mp4`)
    const out = join(OUT_DIR, `${cam}.mp4`)
    await writeFile(raw, blob)

    await run(ffmpegPath, ['-y', '-i', raw, ...encodeArgs(), out])

    const { size } = await stat(out)
    const frames = await countFrames(out)
    totalBytes += size

    const mb = (size / 1024 / 1024).toFixed(2)
    if (frames === EXPECTED_FRAMES) {
      console.log(`✓ ${cam}  ${frames} 影格  ${mb} MB`)
    }
    else {
      console.error(`✗ ${cam}  ${frames} 影格（應為 ${EXPECTED_FRAMES}）  ${mb} MB —— 影格數對不上，影片與數據會錯位`)
      process.exitCode = 1
    }
  }

  const totalMb = totalBytes / 1024 / 1024
  console.log(`合計 ${totalMb.toFixed(2)} MB（預算 ${TOTAL_BUDGET_MB} MB，CRF ${CRF}、寬 ${SCALE_WIDTH}）`)
  if (totalMb > TOTAL_BUDGET_MB)
    console.warn('⚠ 超出預算，用 POSE_VIDEO_CRF=30 或 POSE_VIDEO_WIDTH=640 重跑可再小一圈')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
