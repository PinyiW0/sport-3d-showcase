# 受保護的模組內容

模組展示頁 `/modules/<slug>` 有六個區塊。其中四塊只有解鎖後才看得到：

| 區塊 | `ModuleSpec` 以外的欄位 |
|------|------|
| 數據資料 | `data` |
| 交接說明 | `handoff` |
| 已知限制 | `limitations` |
| 參考資料 | `references` |

訪客看得到的是另外兩塊：**模組呈現**（`presentation`）與**使用技術**（`tech`）。首頁卡片與側邊選單不受影響，照常全部可見可點。

## 為什麼不直接寫在 registry 裡

這個 repo 是公開的，網站也是公開網址。任何寫進 `app/modules/registry.ts` 的東西都會被打包進前端 bundle，訪客開 devtools 就翻得到。所以四區塊的內容不住在程式碼裡。

## 兩個檔案

```
protected/modules.plain.json      明文。不進版控（.gitignore 擋住）
public/protected/modules.enc.json 密文。進版控，CI 建置時只需要這份
```

明文刻意放在 repo 根目錄而不是 `app/` 底下。`app/` 是 Nuxt 的來源目錄，放進去就有被掃描或被 import 的可能；放在外面是結構上的保證，不靠人記得。

加密方式是 PBKDF2-SHA256（600,000 次迭代）派生金鑰，配 AES-GCM 256-bit。實作在 `app/utils/protected-crypto.ts`，瀏覽器與腳本共用同一份原始碼。

## 密碼

一組共用密碼，存在你自己的密碼管理器裡。本機放在 `.env` 的 `SPORT3D_PROTECT_PASSWORD`（該檔已 gitignore）。

repo 裡任何地方都不留密碼，也不留提示。

## 換電腦、重新 clone 之後

明文不在版控裡，所以新 clone 出來只有密文。用密碼把明文解回來：

```bash
npm run protect:decrypt
```

沒有 `.env` 的話腳本會互動式問你密碼。

要把明文印到畫面而不落地，加 `--stdout`。**這時一定要帶 `--silent`**：

```bash
npm run --silent protect:decrypt -- --stdout
```

少了 `--silent`，npm 會把自己的執行橫幅一起印進 stdout，接管線做比對就會得到假的差異。
直接用 node 跑也可以，但要自己補上讀 `.env` 的參數：

```bash
node --env-file-if-exists=.env scripts/protect-decrypt.mjs --stdout
```

漏掉那個參數，腳本拿不到密碼會直接結束，什麼都不印。

## 改了四區塊的內容之後

改的是 `protected/modules.plain.json`，改完一定要重新加密，否則網站上還是舊的：

```bash
npm run protect:encrypt
git add public/protected/modules.enc.json
```

忘了這步的話 `npm run eslint` 會擋下來（`scripts/protected-content-check.mjs` 會比對密文裡的 slug 清單與 registry 是否一致）。

## 四支指令

| 指令 | 做什麼 | 需要密碼 |
|------|--------|---------|
| `npm run protect:encrypt` | 明文 → 密文 | 是 |
| `npm run protect:decrypt` | 密文 → 明文（換電腦時救回） | 是 |
| `npm run protect:verify` | 解密密文與本機明文逐字元比對 | 是 |
| `npm run protect:leakscan` | 掃 `nuxt generate` 的產物有沒有明文洩漏 | 否，但要有明文 |

`protect:leakscan` 要先 `npm run generate` 才有東西可掃。它做的是 `protected-content-check.mjs`
守不到的那一半：那支只檢查 registry 有沒有帶受保護欄位，但同一段文字如果被複製到某個
`.vue` 元件裡寫死，照樣會進 bundle——這支就是掃這個。

掃到的重疊不一定是錯的。公開文案與受保護內容描述同一個模組，字面重疊本來就會發生。
腳本裡的 `ALLOWED` 清單記錄了已經確認過、可以接受的重疊與理由。要往裡面加之前先問自己：
這句話讓訪客知道了什麼？只要答案裡有「原本只有解鎖後才該知道的事」，那就該改文案，不是加白名單。

## 新增一個模組的時候

1. `app/modules/registry.ts` 加公開欄位（slug、title、summary、tags、tech…）
2. `protected/modules.plain.json` 加同一個 slug 的四區塊內容
3. `npm run protect:encrypt`

少了第 2、3 步，`npm run eslint` 會紅。

## 兩件機制守不住、要靠自己記得的事

**首頁的 `summary` 與 `tags` 是公開的。** 需求就是要訪客看得到模組清單，所以這兩個欄位不加密。不要把敏感細節寫進 summary。

**守門腳本只檢查 `registry.ts` 一個檔。** 如果有人把交接說明直接硬寫在某個 .vue 元件裡，這套機制抓不到。

## 這套機制擋得住誰、擋不住誰

擋得住路過的陌生人與爬蟲。擋不住拿到密碼的人——解鎖之後內容就在瀏覽器記憶體裡，複製走是零成本。

密文放在公開 repo，意味著有心人可以離線暴力破解。唯一的防線是密碼強度，所以密碼必須是隨機產生的長密碼，不能是「公司名＋年份」這種。

密碼一旦外流，換密碼只保護之後才寫進去的新內容。git 歷史裡的舊密文永久可取，舊密碼永遠解得開舊密文。
