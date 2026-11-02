// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Node 版本以 .nvmrc 為準，CI 各 workflow 讀它、package.json engines 跟它對齊。
// scripts/*.mjs 直接 import .ts，需要 Node 22.18+ 預設開啟的 type stripping；
// 本機版本低於 .nvmrc 時 npm run eslint 會報 ERR_UNKNOWN_FILE_EXTENSION。
function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), 'utf8')
}

const nvmrc = read('.nvmrc').trim()

describe('各處 Node 版本同步', () => {
  it('.nvmrc 是確切版本號', () => {
    expect(nvmrc, '.nvmrc 要寫 x.y.z，不寫浮動版（26、lts/*）').toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('package.json 的 engines.node 等於 >=<.nvmrc>', () => {
    const engines = (JSON.parse(read('package.json')) as { engines?: { node?: string } }).engines?.node
    expect(engines, `package.json 的 engines.node 與 .nvmrc（${nvmrc}）不一致`).toBe(`>=${nvmrc}`)
  })

  it('每個 CI workflow 一律用 node-version-file 讀 .nvmrc，不寫死版本', () => {
    const dir = '.github/workflows'
    const files = readdirSync(fileURLToPath(new URL(`../../${dir}`, import.meta.url)))
      .filter(name => /\.ya?ml$/.test(name))
    for (const name of files) {
      expect(read(`${dir}/${name}`), `${name} 寫死了 node-version`).not.toMatch(/^\s*node-version:/m)
    }
  })
})
