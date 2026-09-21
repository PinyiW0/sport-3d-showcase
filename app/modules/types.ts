import type { Component } from 'vue'

// 模組展示頁的資料模型：一個 ModuleSpec 描述「一個 3D 研究模組」的
// metadata 與六個固定區塊內容（模組呈現／數據資料／使用技術／交接說明／已知限制／參考資料）。
// 新增模組＝往 registry 補一筆 ModuleSpec（＋選配呈現元件）。

// done   = 研究告一段落、呈現與資料都定案
// wip    = 已有可運作實作可以點進去看，但還在調整、未定案
// planned = 尚未動工，只有文字輪廓
export type ModuleStatus = 'done' | 'wip' | 'planned'
export type Sport = 'baseball' | 'football'

/**
 * 模組分析的對象：選單依此分組。
 * 刻意設為必填——新模組加進 registry 時就得選一個，選單自動長出來，
 * 不必另外維護一份清單（維護兩份必定有一天不同步）。
 */
export type ModuleCategory = 'ball' | 'pitcher' | 'batter'

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

/**
 * 已知限制（非必填）：這個做法目前卡在哪、要落地還缺什麼。
 * 寫給日後評估「這條路能不能走」的人看——只放技術上的硬限制，
 * 不放待辦清單（那屬於 issue）。
 */
export type ModuleLimitation = string

/** 參考資料（非必填）：研究筆記、外部連結等 */
export interface ModuleReference {
  label: string
  /** 有連結才顯示為超連結；repo 內檔案路徑留空只顯示文字 */
  href?: string
}

// 六個區塊分兩邊住：公開欄位（tech 等）留在這裡、會進 bundle，訪客不登入就看得到；
// 數據資料／交接說明／已知限制／參考資料四個受保護區塊住 ProtectedModuleContent，
// 只以密文形式存在 public/protected/modules.enc.json，不進 registry。
// 刻意不留 optional 欄位當後路——加回來就等於把明文內容送進 bundle。
export interface ModuleSpec {
  slug: string
  title: string
  sport: Sport
  status: ModuleStatus
  /** 分析對象；選單的分組依據 */
  category: ModuleCategory
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
}

export const SPORT_LABEL: Record<Sport, string> = {
  baseball: '棒球',
  football: '足球',
}

export const STATUS_LABEL: Record<ModuleStatus, string> = {
  done: '已完成',
  wip: '進行中',
  planned: '規劃中',
}

/** 選單分組的標題與順序：宣告順序即選單由上而下的順序 */
export const CATEGORY_LABEL: Record<ModuleCategory, string> = {
  ball: '球',
  pitcher: '投手',
  batter: '打者',
}

/** 一個模組的受保護內容。不進 registry、不進 bundle，由密文資產解出 */
export interface ProtectedModuleContent {
  data: ModuleDataSpec
  handoff: ModuleHandoff
  limitations?: ModuleLimitation[]
  references?: ModuleReference[]
}

/** 全站受保護內容：slug → 內容。即 protected/modules.plain.json 的頂層形狀 */
export type ProtectedModuleMap = Record<string, ProtectedModuleContent>
