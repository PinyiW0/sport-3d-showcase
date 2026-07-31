import { joinURL } from 'ufo'

/**
 * 把 public/ 靜態資源的絕對路徑接上部署 baseURL。
 *
 * Nuxt 只會自動處理 bundle 進來的資源，執行期才組出的字串（fetch 的 json、
 * 給 three 的 .glb、img src）得自己接——GitHub Pages 部署在 /sport-3d/ 子路徑，
 * 沒接前綴的 '/samples/...' 會 404。
 *
 * 在 setup 頂層呼叫一次取得 asset()，回傳的函式不再依賴 Nuxt context，
 * 可安全用在 useFetch 的 getter 或 onMounted 內。
 */
export function useAssetUrl() {
  const base = useRuntimeConfig().app.baseURL
  return (path: string) => joinURL(base, path)
}
