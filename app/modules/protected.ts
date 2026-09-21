import type { ProtectedModuleContent, ProtectedModuleMap } from './types'

// 手寫形狀守衛，不用 zod——這段會進訪客下載的 chunk，體積要輕。

function isNonEmptyStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every(item => typeof item === 'string')
}

export function isProtectedModuleContent(v: unknown): v is ProtectedModuleContent {
  if (v === null || typeof v !== 'object')
    return false
  const content = v as Record<string, unknown>

  const data = content.data
  if (data === null || typeof data !== 'object' || typeof (data as Record<string, unknown>).summary !== 'string')
    return false

  const handoff = content.handoff
  if (handoff === null || typeof handoff !== 'object')
    return false
  const { files, flexPoints } = handoff as Record<string, unknown>
  if (!isNonEmptyStringArray(files) || !isNonEmptyStringArray(flexPoints))
    return false

  if (content.limitations !== undefined && !Array.isArray(content.limitations))
    return false
  if (content.references !== undefined && !Array.isArray(content.references))
    return false

  return true
}

export function isProtectedModuleMap(v: unknown): v is ProtectedModuleMap {
  if (v === null || typeof v !== 'object')
    return false
  return Object.values(v as Record<string, unknown>).every(isProtectedModuleContent)
}
