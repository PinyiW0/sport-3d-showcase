/** plotly.js-dist-min 沒有附型別,這裡只宣告專案用到的 API */
declare module 'plotly.js-dist-min' {
  export function newPlot(
    el: HTMLElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<void>

  export function react(
    el: HTMLElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<void>

  export function purge(el: HTMLElement): void
}
