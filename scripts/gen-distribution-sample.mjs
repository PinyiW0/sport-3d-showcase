#!/usr/bin/env node
// 產生 public/samples/bt3d/distribution.json —— 落點分布圖的合成樣本。
//
// 為什麼是合成的：現有 pitches.json 只有 25 球、且沒有 pitcher / pitch_type 欄位，
// 撐不起「依投手與球種篩選」的分布圖。格式沿用後端 analysis_result.json 的
// snake_case 子集，接真實資料時只要換檔即可。
//
// 分布中心依球種特性設定（速球偏高、變化球偏低、左右各有偏好），是示意值不是量測值。
// 固定 seed，重跑結果一致。

import { writeFileSync } from 'node:fs'

const SEED = 20260729
const PLATE_Y = 21.59 // 入壘點的 y，與真實樣本一致

// mulberry32：固定 seed 的 PRNG，讓樣本可重現
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = makeRng(SEED)

/** Box-Muller 常態亂數 */
function gauss(mean, sd) {
  const u = 1 - rng()
  const v = rng()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const round2 = n => Math.round(n * 100) / 100

// 球種：代號與參數的單一真理來源是 spec/domain/pitch-types.md，改這裡要同步改那份
// cx/cz = 落點中心（cm，cz 為離地高度）；sx/sz = 散度；velo = 球速中心與散度
// cx 假設右投手：臂側跑動朝三壘側（負），手套側位移朝一壘側（正）
const PITCH_TYPES = {
  '4S': { cx: 0, cz: 80, sx: 12, sz: 14, velo: [138, 6] }, // 四縫線速球，基準球種、偏高
  'SK': { cx: -9, cz: 56, sx: 13, sz: 13, velo: [132, 6] }, // 伸卡球，臂側跑動且下沉
  'CT': { cx: 6, cz: 68, sx: 12, sz: 13, velo: [133, 5] }, // 卡特球，小幅切入、球速接近速球
  'SL': { cx: 11, cz: 55, sx: 14, sz: 15, velo: [124, 5] }, // 滑球，手套側橫移＋下墜
  'SW': { cx: 18, cz: 58, sx: 16, sz: 14, velo: [121, 5] }, // 橫掃球，橫移約滑球兩倍、下墜較少
  'CB': { cx: 4, cz: 44, sx: 13, sz: 18, velo: [116, 5] }, // 曲球，大幅下墜、縱向散度最大
  'CH': { cx: -6, cz: 52, sx: 14, sz: 14, velo: [121, 5] }, // 變速球，臂側偏低、靠速差
  'SP': { cx: -2, cz: 42, sx: 12, sz: 16, velo: [126, 5] }, // 指叉球，近零橫移的急墜、落點最低
  'KN': { cx: 0, cz: 60, sx: 22, sz: 22, velo: [105, 7] }, // 蝴蝶球，飄移無方向性、兩軸散度最大
  'OTH': { cx: 0, cz: 62, sx: 18, sz: 18, velo: [125, 9] }, // 其他，降級桶不代表單一球種、區間寬
}

// 投手：bias 為個人控球偏移，spread 為散度倍率，veloBias 為球速差
// mix 的權重決定球種配比——刻意讓部分組合不存在，UI 要能處理空結果
const PITCHERS = [
  { id: 'P01', date: '2026-07-20', count: 165, bias: [0, 2], spread: 0.85, veloBias: 0, mix: { '4S': 38, 'SL': 24, 'CH': 20, 'CB': 18 } },
  { id: 'P02', date: '2026-07-22', count: 140, bias: [3, 4], spread: 1.15, veloBias: 4, mix: { '4S': 34, 'SK': 26, 'CT': 22, 'SL': 18 } },
  { id: 'P03', date: '2026-07-24', count: 155, bias: [-5, 0], spread: 1, veloBias: -3, mix: { '4S': 26, 'CB': 22, 'CH': 22, 'SW': 20, 'OTH': 10 } },
  { id: 'P04', date: '2026-07-26', count: 140, bias: [1, -5], spread: 1.05, veloBias: 0, mix: { '4S': 28, 'SK': 22, 'SP': 20, 'KN': 18, 'OTH': 12 } },
]

/** 依權重抽球種 */
function pickType(mix) {
  const entries = Object.entries(mix)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let r = rng() * total
  for (const [type, w] of entries) {
    r -= w
    if (r <= 0)
      return type
  }
  return entries[0][0]
}

const rows = []

for (const pitcher of PITCHERS) {
  // 場次從 18:30 開始，每球間隔 20~70 秒
  let elapsedMs = 0
  for (let i = 0; i < pitcher.count; i++) {
    const type = pickType(pitcher.mix)
    const spec = PITCH_TYPES[type]

    // 5% 失投：散度放大，模擬暴投與明顯跑掉的球
    const wild = rng() < 0.05 ? 2.4 : 1
    const spread = pitcher.spread * wild

    const x = gauss(spec.cx + pitcher.bias[0], spec.sx * spread)
    const z = gauss(spec.cz + pitcher.bias[1], spec.sz * spread)
    const velocity = gauss(spec.velo[0] + pitcher.veloBias, spec.velo[1])

    elapsedMs += (20 + rng() * 50) * 1000
    const ts = new Date(`${pitcher.date}T18:30:00.000Z`).getTime() + elapsedMs

    rows.push({
      ts: new Date(ts).toISOString().replace('Z', '000'), // 對齊真實樣本的微秒精度、無時區
      pitcher: pitcher.id,
      pitch_type: type,
      strike_zone_point: [round2(x), PLATE_Y, round2(Math.max(z, 2))],
      pitch_velocity: round2(velocity),
    })
  }
}

rows.sort((a, b) => a.ts.localeCompare(b.ts))

// 每球一行：檔案可讀，又不會像逐欄縮排那樣膨脹三倍。
// 空白照 eslint 的 jsonc 規則排（key 後一空格、逗號後一空格、括號內留白），
// 否則 npm run eslint 會把這個檔判成上千個格式錯誤。
function line(r) {
  return `  { "ts": "${r.ts}", "pitcher": "${r.pitcher}", "pitch_type": "${r.pitch_type}", `
    + `"strike_zone_point": [${r.strike_zone_point.join(', ')}], "pitch_velocity": ${r.pitch_velocity} }`
}
const json = `[\n${rows.map(line).join(',\n')}\n]\n`
writeFileSync('public/samples/bt3d/distribution.json', json)

// 統計摘要，供人工核對分布是否合理
const zone = { left: -21.59, right: 21.59, bottom: 46.44, top: 92.02 }
const inZone = rows.filter((r) => {
  const [x, , z] = r.strike_zone_point
  return x >= zone.left && x <= zone.right && z >= zone.bottom && z <= zone.top
})
console.log(`共 ${rows.length} 球，好球帶內 ${inZone.length} 球（${(inZone.length / rows.length * 100).toFixed(1)}%）`)
console.log(`檔案大小 ${(json.length / 1024).toFixed(1)} KB`)
for (const p of PITCHERS) {
  const own = rows.filter(r => r.pitcher === p.id)
  const byType = Object.entries(
    own.reduce((acc, r) => ({ ...acc, [r.pitch_type]: (acc[r.pitch_type] ?? 0) + 1 }), {}),
  ).map(([t, n]) => `${t}:${n}`).join(' ')
  console.log(`  ${p.id} ${own.length} 球  ${byType}`)
}
