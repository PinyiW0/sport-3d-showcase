# scene3d — three.js 場景基礎設施

> **這不是展示模組，沒有對外 `.vue`**，不會出現在索引頁。它是 `pitch-pose` 與 `pitch-trajectory`
> 共用的 three 樣板層，被兩者以相對路徑 `../scene3d/core/…` import。
> **交接那兩個模組時必須一併帶走這個資料夾。**

## 為什麼存在

`pitch-pose` 骨架版與 `pitch-trajectory` 從 Plotly 遷到 three.js 後，兩邊都需要同一組東西：
場景樣板、3D 軸盒與刻度、hover 標籤。這些不是「幾行樣板」——軸盒含刻度級距選取、
背板換邊、標籤尺寸的距離補償等實質數學，複製兩份必然分岔。

`baseball-spin` 沒有用這一層：它是正交相機、無軸盒的單球特寫，需求形狀完全不同，
硬套共用層只會讓兩邊都變複雜。

## 檔案

| 檔案 | 責任 |
|------|------|
| `core/viewport.ts` | renderer / 相機 / OrbitControls / resize / rAF 迴圈 / 資源釋放；另 export `disposeObject3D` |
| `core/axisBox.ts` | 軸盒外框 + 三面背板格線 + 刻度數字 + 軸標題；另 export `AXIS_THEME`、`SCENE_BG` 兩套配色 |
| `core/hoverLabel.ts` | 滑鼠停留顯示點名稱的浮層 |
| `core/axisBox.spec.ts` | 刻度級距與刻度值的單元測試 |

## 關鍵設計決策

### 座標系是 z-up，直接用資料原生單位

`Viewport` 的相機 `up` 預設 `[0, 0, 1]`，世界單位就是資料的 cm。棒球資料
（x 左右、y 投手方向、z 高度）本來就是 z-up，轉成 three 慣例的 y-up 只會讓每個模組
都得記一次轉換規則。

連帶好處：three 的真實 3D 空間**天然等比例**，Plotly 版那套「每 200cm 對應 1 視覺單位」
的 `aspectratio` 人工換算（`aspectmode: 'manual'`）整段不需要。

> 例外：`Pose3dHuman.vue` 仍是 y-up，因為 Mixamo glTF 模型是 y-up 的，
> 它走自己的 `toThreeSpace()` 轉換，不使用這一層。

### 線寬一律用 Line2，不用 LineBasicMaterial

three 的 `LineBasicMaterial.linewidth` 在絕大多數平台**恆為 1px**（WebGL 核心限制）。
骨架的骨頭（Plotly 版 `width: 6`）與九宮格外框（`width: 3`）直接換過去會全變髮絲，
視覺退化很明顯。兩個模組一律用 `three/addons/lines/Line2.js`。

代價是 `LineMaterial` 需要知道畫布尺寸才能算線寬——所以 `Viewport.onResize()` 存在，
resize 時務必更新 `material.resolution`，否則縮放視窗後線寬會失真。

### 軸盒背板會跟著相機換邊

`createAxisBox()` 回傳的 Group 帶 `update(camera)`，每幀呼叫。它做兩件事：

1. **背板換邊**：三個背板永遠貼在背對相機的那一面，旋轉時自動翻到對側，不會擋住資料。
   刻度標籤跟著背板走，恆定落在外緣可見處。（這是 Plotly gl3d 的原生行為，換到 three 要自己做。）
2. **標籤尺寸距離補償**：`Sprite` 是 world-space 尺寸，不補償的話 zoom 進去文字會撐滿畫面。
   依相機距離與 fov 反推，讓文字在螢幕上維持固定比例。

## 使用範例

```ts
const viewport = new Viewport(container, { background: SCENE_BG.dark })

const axes = createAxisBox({
  range: { x: [-100, 100], y: [0, 300], z: [0, 200] },
  colors: AXIS_THEME.dark,
})
viewport.scene.add(axes)

viewport.frameBox(box, new Vector3(1.2, -1, 0.5))
viewport.start(() => {
  axes.update(viewport.camera) // 背板換邊與標籤縮放
})

// 收工
axes.dispose()
viewport.dispose()
```

## 依賴

只有 `three`（含 `three/addons/…`）。無 Vue、無 NuxtUI、無專案 alias——
可直接搬進任何前端框架，Vue/React/Svelte 各自寫薄殼即可。
