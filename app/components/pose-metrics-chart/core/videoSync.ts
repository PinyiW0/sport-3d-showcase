/**
 * 影格序號 ↔ 影片播放時間的換算。
 *
 * 影片與曲線的共同語言是**影格序號**，不是秒數：交付影片是 748 影格、
 * 30fps 的慢動作重編碼（實際擷取約 250fps），兩邊的秒數對不上，但影格 1:1
 * 對應——影片第 N 格就是 biomech.json `timeseries[N]`。
 *
 * 純 TS、零依賴（連 vue 都不 import）。
 */

/**
 * 交付影片的編碼影格率。
 *
 * 不是相機的擷取率（約 250fps）——演算法端把分析過的 748 格重編成 30fps 播出，
 * 等於 8.3 倍慢動作。要顯示「這一格是第幾秒」時請用 `PoseMetrics.timesMs`
 * 的實際擷取時間，不要拿影片時間換算，否則秒數會差 8 倍。
 */
export const VIDEO_FPS = 30

/**
 * 影格序號 → 該格的播放時間（秒）。
 *
 * 取影格的**正中間**而不是起點：時間戳落在兩格邊界上時，瀏覽器的取整方向
 * 沒有保證，可能解到前一格。半格的偏移讓落點永遠在目標格內部。
 */
export function frameToTime(frame: number, fps: number = VIDEO_FPS): number {
  return (frame + 0.5) / fps
}

/** 播放時間（秒）→ 影格序號。與 `frameToTime` 互為反函式（半格偏移下用 floor 才對稱） */
export function timeToFrame(time: number, fps: number = VIDEO_FPS): number {
  return Math.floor(time * fps)
}

/** 夾在 `[0, frameCount - 1]`。`frameCount` 為 0 時回 0 */
export function clampFrame(frame: number, frameCount: number): number {
  const last = Math.max(0, frameCount - 1)
  return Math.min(Math.max(Math.round(frame), 0), last)
}
