# ui-profile 範本（UI 重構 Agent 團隊 — 每專案設定檔）

> **用途**：本檔是 `ui-profile.md` 的範本。搬移套件到新專案後，**複製本檔為 `.opencode/ui-redesign-kit/ui-profile.md` 並逐欄填寫**（或第一次執行 `/ui` 時由 orchestrator 依本範本提綱向你蒐集後代產）。
> **填寫原則**：
> - 範例值僅供參考，**一律換成你專案的實況**；不要照抄範例。
> - agent 本體不含任何專案資訊，**這份檔案是團隊唯一讀取專案設定的地方**；留 `<待填>` 就會在流程中卡住，請填完整。
> - **憑證（帳號、密碼、token）不得寫進本檔明文**，也不得寫進產物或 log。
> - 本檔若指到被 `.gitignore` 忽略的位置（如 storageState 檔），請確認該路徑確實 gitignored。

---

## 1. 專案基本

| 欄位 | 內容 |
|---|---|
| 專案名稱 | `<待填>`（例：`my-frontend-app`） |
| 技術棧 | `<待填>`（例：`Nuxt 2 / Vue 2 / Vuetify 1.5`） |
| 專案用 Node 版本 | `<待填>`（例：`v12.22.12`；dev server／測試／build 用的版本） |

**工具用 Node 絕對路徑**（欄位值填 `<待填>`）：`<待填>`（例：`C:\nvm\v24.15.0\node.exe`）

> **這個欄位是什麼**：kit 的工具（shot／diff／run）一律以「工具用 Node」執行，**與專案用 Node 版本無關**——選一個穩定、不常動的 Node 給工具鏈專用即可。
> **如何取得**：在 PowerShell 執行 `(Get-Command node.exe).Source`（或 `where.exe node`），會列出 node.exe 的絕對路徑；挑一個**版本夠新（建議 ≥ v18，Playwright 需要）且安裝位置穩定**的路徑（例如 nvm 目錄 `C:\nvm\v24.15.0\node.exe`，或系統安裝 `C:\Program Files\nodejs\node.exe`）。**不要**填到會被解除安裝或版本會被切換而改變的臨時路徑。
> **用途**：安裝時 `tools/setup.cmd` 依此欄位產生 `tools/.tool-node.cmd`（gitignored）；此欄位則是給人核對的來源，路徑失效時依安裝指南重新產生，agent 不自行改用其他 Node。

## 2. 指令

### dev server

| 欄位 | 內容 |
|---|---|
| 啟動指令 | `<待填>`（例：`npm run dev`；orchestrator 以背景 bash、在正確的工作目錄執行） |
| port | `<待填>`（例：`3000`） |
| 就緒判斷方式 | `<待填>`（例：`URL 回應 200，或 console 輸出 "Listening on http://localhost:3000"`；可為「port 開始監聽」「特定 log 行」或「HTTP 回應成功」） |

### 測試／lint／build

| 欄位 | 內容 |
|---|---|
| test 指令 | `<待填>`（例：`npm test`） |
| test timeout（ms） | `<待填>`（例：`600000`） |
| lint 指令 | `<待填>`（例：`npx eslint --ext .js,.vue <異動檔案>`；reviewer 會只對異動檔案執行） |
| lint timeout（ms） | `<待填>`（例：`120000`） |
| build 指令 | `<待填>`（例：`npm run build`） |
| build timeout（ms） | `<待填>`（例：`600000`） |

> **提醒**：權限樣式內建 `npm test*`／`npm run build*`／`npm run lint*`／`npx eslint*` 的 shell 白名單字串（npm 生態預設）；你的指令若不是這些字串開頭，依「安裝指南.md」第 6 項同步調整三個檔案（orchestrator、functional-qa、reviewer）的權限字串。

### 測試基準線與慣例

| 欄位 | 內容 |
|---|---|
| 測試基準線（項數） | `<待填>`（例：`99 項全數通過、0 失敗`；數量會隨功能增加） |
| 測試框架 | `<待填>`（例：`ava 2 + @vue/test-utils`） |
| **測試目錄** | `<待填>`（例：`test/`；functional-qa 補特徵測試的位置，安裝必改清單第 4 項會用到） |
| 寫法參考檔 | `<待填>`（例：`test/specs/FontSizeWiring.spec.js`；給 agent 模仿的既有測試檔） |

## 3. 樣式系統

| 欄位 | 內容 |
|---|---|
| 樣式機制 | `<待填>`（例：`less + scoped style；全域變數在 assets/less/app.less；元件庫主題用 Vuetify theme`；可為 less／scss／css 變數／元件庫 theme…） |
| design tokens 映射位置 | `<待填>`（例：`src/assets/less/variables.less`；design-tokens.json 要映射到的變數檔或 theme 檔） |
| 全域樣式檔 | `<待填>`（例：`src/assets/less/app.less`；reviewer 檢查樣式污染的範圍） |
| 禁改樣式區 | `<待填>`（例：`app.less 的 .v-input 段落——其他頁面共用，改動前須使用者同意`；無則寫「無」） |

## 4. 結構

| 欄位 | 內容 |
|---|---|
| 頁面目錄 | `<待填>`（例：`pages/`） |
| 元件目錄 | `<待填>`（例：`src/components/`） |
| store | `<待填>`（例：`store/index.js`；無 store 寫「無」） |
| API 層 | `<待填>`（例：`src/api/`） |
| i18n 檔 | `<待填>`（例：`src/locales/zh-TW.json、en.json`；無則寫「無」） |
| 路由檔 | `<待填>`（例：`pages/` 目錄慣例或 `router/index.js`） |

## 5. 頁面進入前置

| 欄位 | 內容 |
|---|---|
| 進入條件 | `<待填>`（例：`無認證，直接開 URL`；或 `需登入才能進入目標頁`） |
| 取得方式 | 無認證時寫 `無需 storageState`；需認證／前置時寫 **storageState 檔案路徑**或 cookie／token 來源檔的路徑：`<待填>` |

> **storageState 說明**：shot 與客製腳本以 `--url-file` 參數檔內的 `storageState` 欄位帶入（Playwright 的 storage state JSON 格式，含 cookies＋localStorage）。產生方式例：在你的日常瀏覽器登入後，用 Playwright 錄製匯出，或請 orchestrator 以 `tools/codegen.cmd` 輔助。
> **規則**：storageState 檔放 **gitignored 路徑**、由使用者提供；**憑證不得寫進本檔明文、產物文件或 log**。

## 6. 安全不變量（reviewer 與 developer 必讀）

| 欄位 | 內容 |
|---|---|
| 渲染安全慣例 | `<待填>`（例：`外部資料渲染前必須經 src/util/sanitizer 清理；markdown 經 renderMarkdown（DOMPurify 白名單）`） |
| 既有 `v-html` 位置與契約 | `<待填>`（例：`src/components/chatroom/chat/ChatWindow/ChatBox.vue:45 — 僅接受經 renderMarkdown 的機器人訊息，不得直接綁定原始資料`；無則寫「無」） |

## 7. 禁改區

預設（**一律保留**）：API 契約、store 核心狀態、socket 事件、路由資料流。

專案增補（可留空）：`<待填>`（例：`utils/markdown.js 的白名單`）

> 可選強化：經使用者同意後，把禁改區的具體路徑加進 developer 的 edit deny（安裝指南第 6 項之外的微調），讓權限強制；預設僅指令層級規範。

## 8. 設計素材

| 檔案／網址 | 格式 | 說明 |
|---|---|---|
| `<待填>`（例：`C:\designs\chat-page.png`） | PNG/JPEG | `<整頁版面設計圖>` |
| `<待填>`（例：`C:\designs\prototype\index.html` 或 `https://…`） | HTML 原型 | `<可精確量測的頁面原型`；無則寫「無」 |
| `<待填>` | 規格／標注文件 | `<字級表、間距標注、互動狀態說明等`；無則寫「無」 |

## 9. 驗收

| 欄位 | 內容 |
|---|---|
| Viewport 清單 | `<待填>`（例：`1440x900、375x812`；visual-qa 每個 Viewport 各截一張） |
| 差異像素門檻 | `<待填>`（例：`2%`；試行值可調；**僅為參考門檻，最終驗收由使用者裁決**） |
| 特別驗收要求 | `<待填>`（例：`送出訊息按鈕 hover 狀態需與設計圖一致`；無則寫「無」） |

## 10. 產物

| 欄位 | 內容 |
|---|---|
| **產物根目錄** | `<待填>`（例：`docs/ui-redesign`） |

> **預設為 `docs/ui-redesign`**。改變此值時，必須同步「安裝指南.md」第 3 項（把 6 個 agent 檔案權限規則中的 `<產物根目錄>` 字串替換）。
> 產物結構（由團隊自動產生）：`<產物根目錄>/<頁面slug>/` 下有 functional-baseline.md、design-spec.md、design-tokens.json、component-mapping.md、pending-questions.md、visual-report.md、functional-report.md、code-review.md、scripts/、.artifacts/（截圖，gitignored，不進版控）。

## 11. 流程程序文件（可選）

| 欄位 | 內容 |
|---|---|
| 路徑 | `<待填>`（例：`.opencode/worktree-procedures.md`；未填則 orchestrator 使用套件內建的通用 worktree 程序） |

> 引用任何外部程序時，套件的四條插入規則（worktree 命名 `ui-<slug>`／分支 `ui-redesign/<slug>`、kit junction 插入與拆除、清除閘門）**一律適用**——詳見 orchestrator 指令的「worktree 程序」與「安裝指南.md」。

## 12. 其他

| 欄位 | 內容 |
|---|---|
| eslint 風格 | `<待填>`（例：`eslint standard（無分號、2 空格縮排、單引號）`） |
| 語系 | `<待填>`（例：`繁體中文（台灣用詞）`） |
| commit 規範引用 | `<待填>`（例：`commit 訊息一律繁體中文，先經使用者審核`；或引用專案內規範文件路徑） |
