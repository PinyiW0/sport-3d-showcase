#!/usr/bin/env node
// 模組可攜性檢查——保證每個 3D 研究模組能「整包 cp 進新專案就跑」。
//
// 模組判定：app/components/<name>/ 底下有 core/ 的資料夾（common/、modules/ 不算，
// 那是本專案的消費端，本來就該用 NuxtUI 與 ~/ alias）。
//
// 規則：
//   1. 執行期檔案不得用 alias（~/、@/、#）——alias 綁死宿主專案設定，換專案就要手改
//   2. 執行期檔案的 npm 套件依賴必須列在下方 RUNTIME_ALLOWED——刻意的摩擦：
//      給可攜模組加套件是要付交接成本的決定，不該無聲發生
//   3. 相對路徑跳出自己模組資料夾 → 不擋，但列為外部依賴印出來，
//      提醒該模組的 README「整包 cp 時要一併帶走誰」
//
// 由 npm run eslint 串跑；違規列出 file:line 並以 exit 1 失敗。

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const COMPONENTS_DIR = 'app/components'

// 所有模組都可用的執行期依賴
const RUNTIME_ALLOWED_ALL = ['vue']

// 各模組額外允許的 npm 套件（含 subpath，如 three/addons/… 由 three 放行）
// 渲染器分家：<模組>-data 是渲染器無關的資料層，<模組> 是 Three.js 版，
// <模組>-plotly 是 Plotly 對照版。要哪一版就整包搬那個資料夾 + 對應的 -data。
const RUNTIME_ALLOWED = {
  'baseball-spin': ['three', 'zod'],
  // scene3d 是各 Three.js 版模組共用的樣板層，無對外元件
  'scene3d': ['three'],
  // 資料層零 npm 依賴（連 vue 都不用），純 TS 才能被兩種渲染器共用
  'pitch-pose-data': [],
  'pitch-pose': ['three'],
  'pitch-pose-plotly': ['plotly.js-dist-min'],
  'pitch-trajectory-data': [],
  'pitch-trajectory': ['three'],
  'pitch-trajectory-plotly': ['plotly.js-dist-min'],
}

// 測試檔專用：測試不隨模組進入執行期，放寬到測試框架與讀 fixture 的 node 內建模組
const TEST_ONLY_ALLOWED = ['vitest', '@vue/test-utils', 'node:fs', 'node:path', 'node:url', 'node:process']

const TEST_FILE = /\.(?:spec|test)\.ts$/
const SOURCE_FILE = /\.(?:ts|vue)$/
// `@/` 是 alias，`@vue/test-utils` 是 scoped 套件——差別在 @ 後面是不是斜線
const ALIAS = /^(?:[~#]|@\/)/

// 三條各自簡單的規則，勝過一條包山包海但會災難性回溯的正則。
// 已知限制：`const from = './x'` 這種變數名叫 from 的寫法會誤判成 import，
// 實務上不會出現，真遇到就把它改名——比放寬檢查安全。
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g, // import / export … from '…'
  /\bimport\s*\(\s*['"]([^'"]+)['"]/g, // dynamic import('…')、typeof import('…')
  /^\s*import\s+['"]([^'"]+)['"]/gm, // bare import '…'
]

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory())
      return walk(full)
    return SOURCE_FILE.test(full) ? [full] : []
  })
}

/** 套件名比對，允許 subpath：three 放行 three/addons/loaders/GLTFLoader.js */
function matchesPackage(specifier, allowed) {
  return allowed.some(pkg => specifier === pkg || specifier.startsWith(`${pkg}/`))
}

const modules = readdirSync(COMPONENTS_DIR).filter((name) => {
  const dir = join(COMPONENTS_DIR, name)
  return statSync(dir).isDirectory() && readdirSync(dir).includes('core')
})

const violations = []
/** 模組名 → 該模組要一併帶走的外部檔案（模組資料夾外的相對 import） */
const externalDeps = {}
let fileCount = 0

for (const name of modules) {
  const moduleDir = resolve(COMPONENTS_DIR, name)
  const allowed = [...RUNTIME_ALLOWED_ALL, ...(RUNTIME_ALLOWED[name] ?? [])]
  const outside = new Set()

  for (const file of walk(join(COMPONENTS_DIR, name))) {
    fileCount++
    const isTest = TEST_FILE.test(file)
    const lines = readFileSync(file, 'utf8').split('\n')

    lines.forEach((line, i) => {
      const specifiers = new Set(
        SPECIFIER_PATTERNS.flatMap(pattern => Array.from(line.matchAll(pattern), m => m[1])),
      )

      for (const specifier of specifiers) {
        const at = `${file}:${i + 1}`

        if (ALIAS.test(specifier)) {
          violations.push(`${at} 用了 alias「${specifier}」——改成相對路徑，模組才能整包搬走`)
          continue
        }

        if (specifier.startsWith('.')) {
          const target = resolve(dirname(file), specifier)
          if (!target.startsWith(`${moduleDir}/`))
            outside.add(relative(process.cwd(), target))
          continue
        }

        if (isTest && matchesPackage(specifier, TEST_ONLY_ALLOWED))
          continue
        if (matchesPackage(specifier, allowed))
          continue

        violations.push(
          `${at} 未宣告的套件依賴「${specifier}」`
          + `——確定要讓 ${name} 依賴它，就加進 scripts/module-portability-check.mjs 的 RUNTIME_ALLOWED`,
        )
      }
    })
  }

  if (outside.size)
    externalDeps[name] = [...outside].sort()
}

if (violations.length) {
  console.error(`模組可攜性檢查失敗：\n${violations.map(v => `  ${v}`).join('\n')}`)
  process.exit(1)
}

const summary = Object.entries(externalDeps)
  .map(([name, deps]) => `\n  ${name} 需一併帶走：${deps.join('、')}`)
  .join('')
console.log(`模組可攜性檢查通過（${modules.length} 個模組、${fileCount} 個檔）${summary}`)
