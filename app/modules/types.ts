import type { Component } from 'vue'

// 模組展示頁的資料模型：一個 ModuleSpec 描述「一個 3D 研究模組」的
// metadata 與五個固定區塊內容（模組呈現／數據資料／使用技術／交接說明／參考資料）。
// 新增模組＝往 registry 補一筆 ModuleSpec（＋選配呈現元件）。

export type ModuleStatus = 'done' | 'planned'
export type Sport = 'baseball' | 'football'

/** 數據資料：這個模組吃什麼、格式為何、樣本在哪 */
export interface ModuleDataSpec {
  /** 一句話講清楚吃什麼資料 */
  summary: string
  /** 資料格式／型別說明 */
  format?: string
  /** 樣本內容（原樣 JSON 字串，於頁面可摺疊檢視） */
  sample?: string
  /** 樣本檔位置 */
  sampleUrl?: string
}

/** 交接說明：搬移此模組要搬什麼、依賴什麼、哪裡可彈性微調 */
export interface ModuleHandoff {
  /** 搬移要搬的檔案／資料夾 */
  files: string[]
  /** 依賴套件 */
  dependencies?: string[]
  /** 可彈性微調處 */
  flexPoints: string[]
}

/** 參考資料（非必填）：研究筆記、外部連結等 */
export interface ModuleReference {
  label: string
  /** 有連結才顯示為超連結；repo 內檔案路徑留空只顯示文字 */
  href?: string
}

export interface ModuleSpec {
  slug: string
  title: string
  sport: Sport
  status: ModuleStatus
  /** 卡片與頁面簡介 */
  summary: string
  tags: string[]
  /** 最後更新（planned 可留空） */
  updated?: string
  /** 既有獨立 demo 路由（若有） */
  demoRoute?: string
  /** 模組呈現元件（3D／視覺化）；planned 模組留空，頁面顯示 placeholder */
  presentation?: Component
  /** 使用技術 */
  tech: string[]
  /** 數據資料 */
  data: ModuleDataSpec
  /** 交接說明 */
  handoff: ModuleHandoff
  /** 參考資料（非必填） */
  references?: ModuleReference[]
}

export const SPORT_LABEL: Record<Sport, string> = {
  baseball: '棒球',
  football: '足球',
}

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  done: '已完成',
  planned: '規劃中',
}
