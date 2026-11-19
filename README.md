# UI Redesign Agent Team

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-lightgrey)
![Node](https://img.shields.io/badge/tools--node-%3E%3D20-green)

一組 **6 個 OpenCode V2 Agent**（`ui-redesign/` 前綴）＋**可攜工具套件**（`ui-redesign-kit`），專門處理「UI 設計素材 → 既有前端專案還原實作」：把設計公司提供的 PNG/JPEG 設計圖、靜態 HTML 原型、規格文件，還原成既有前端專案的高保真 UI——**功能、事件、API 契約、資料流原則上全部保留；功能取捨（含設計稿新增的功能）一律由使用者裁決**。

與一般的「重寫式」UI 生成不同，本套件的設計核心是：**實作與判定分離、每一步以證據把關**，改版完成後既有團隊可以繼續在同一份程式碼上開發功能。

---

## 核心特性

- **七階段流程**：準備 → 基準建立（含功能對照閘門）→ 設計與功能取捨決策點 → 實作 → 視覺迴圈（最多 3 輪）→ 功能回歸＋程式審核 → 交付（含功能取捨 FQ／NF 清單）。
- **分工由權限強制**：所有 agent 的 `subagent` 權限一律 `deny *`，只有 orchestrator 能派工（且僅限 5 個完整 agent ID）——任何 agent 無法再派工繞過分工。
- **證據導向**：視覺判定以 Playwright Chromium 截圖＋pixelmatch 比對為據，交付含 overlay／diff 圖；審核以量測值、測試結果、diff 為據，不得以主觀描述代替。
- **功能防護（先織網再動手）**：改版前先建立功能基準——補特徵測試（舊版先通過）、寫回歸腳本、記錄測試基準線；改版後重跑對照，測試與回歸腳本項數不得少於**調整後基準**（無 FQ 核准扣除時即原始基準）、不得有失敗。
- **功能取捨不漏接**：舊版有、新設計未涵蓋或只涵蓋部分的功能，一律以 `F-xx` 對照並開 `FQ`，由使用者在階段 1.5 裁決保留／移除／調整／另案；未裁決不得凍結，developer 不得自行刪功能；移除功能需調整測試／腳本時走「調整後基準」。
- **新增功能不漏接**：設計稿有、舊版沒有的互動功能，一律以 `NF-xx` 建檔並開 NF 問題，由使用者裁決納入／不納入／另案；需要新 API／事件／資料流者標註「超出 UI 還原範圍」，未裁決不得實作，developer 也不得自行「照設計稿做」。
- **可攜性**：agent 本體零專案資訊（技術棧、路徑、指令全部不寫死）；搬家＝複製資料夾＋依安裝必改清單調整＋填一份 `ui-profile.md`。
- **環境隔離**：工具用 Node 與專案 Node 分離（不切全域、不碰專案 package.json）；瀏覽器用 Playwright 自帶 Chromium（不用系統 Chrome），與日常瀏覽環境完全隔離。

## 團隊架構

本套件與 OpenCode 專案中**既有的** orchestrator／developer／reviewer 三人組完全獨立並存，互不修改對方檔案。

| Agent ID | 模式 | 核心職責 |
|---|---|---|
| `ui-redesign/orchestrator` | primary | 七階段流程協調、功能對照閘門（雙向）、派工、輪數控制、dev server 管理、worktree 程序、交付 |
| `ui-redesign/design-analyzer` | subagent | 解析設計素材 → 設計規格（來源等級含使用者裁決）、design tokens、元件對照（含功能涵蓋與新增功能對照）、待確認清單（PQ／FQ／NF） |
| `ui-redesign/developer` | subagent | 依設計規格實作 UI，優先重用既有元件；實作前做功能取捨預檢（FQ／NF）；禁改 `.opencode/**`、`.env*` |
| `ui-redesign/visual-qa` | subagent | 截圖比對設計素材 → 視覺差異報告（`VERDICT: PASS/FAIL`＋證據圖；排除設計外保留項、NF 已裁決未出現項〔不納入／另案／`x2`〕） |
| `ui-redesign/functional-qa` | subagent | 建立功能基準（`F-xx` 固定 ID＋特徵測試＋回歸腳本）＋改版後功能回歸（含功能取捨與新增功能對照） |
| `ui-redesign/reviewer` | subagent | 程式品質、樣式污染、XSS/安全、需求符合度六步驟驗證（含功能取捨與新增功能查核）、非預期改動偵測 |

## 檔案結構

```
UI_Redesign_Agent_Team/
├── README.md、LICENSE、.gitignore
├── docs/
│   ├── 2026-11-11-UI重構Agent團隊-設計書.md    ← 完整設計文件（權限逐條、流程、異常處理）
│   └── OpenCode_Web_UI_Agent_Orchestration_Guide.md  ← ChatGPT 討論稿（設計前的研究筆記）
└── .opencode/                                 ← ★ 搬家＝複製這個整層到目標前端專案
    ├── agents/ui-redesign/                    ← 6 個 agent（OpenCode V2 frontmatter＋permissions）
    └── ui-redesign-kit/
        ├── ui-profile-範本.md                 ← 每專案設定檔範本（唯一專案特定內容）
        ├── 安裝指南.md                        ← 搬家與初始化的標準程序（含安裝必改清單）
        ├── 使用手冊.md                        ← 安裝後的日常操作說明（流程、互動點、產物解讀、異常處理）
        ├── 驗測清單.md                        ← 三層驗測程序（套件層自動／OpenCode 層手動／端到端試跑）
        ├── worktree-procedures.md             ← 套件內建 worktree 程序（ui-profile 未填自訂文件時使用；可直接修改微調）
        ├── commands/ui-redesign.md            ← /ui-redesign 命令檔（安裝時複製到 .opencode/commands/）
        └── tools/                             ← 瀏覽器工具包（獨立 package.json）
            ├── package.json                   ← playwright、pixelmatch、pngjs
            ├── lib/paths.mjs                  ← 共用：主工作區根推導＋路徑契約＋URL 參數檔
            ├── shot.mjs / shot.cmd            ← 截圖（PNG）＋頁內量測（JSON）
            ├── diff.mjs / diff.cmd            ← 兩圖比對（內建對齊→overlay＋diff＋差異百分比）
            ├── run.mjs / run.cmd              ← 執行客製回歸腳本（路徑驗證）
            ├── codegen.cmd                    ← Playwright codegen 互動錄製（可選輔助）
            ├── setup.cmd                      ← 初始化（互動式）
            ├── .tool-node.cmd                 ← 機器特定設定（gitignore，安裝時產生）
            └── .browsers/                     ← 瀏覽器二進位（gitignore，安裝時產生）
```

> `.opencode/` 路徑是功能的一部分：agent 權限白名單、工具的主工作區根推導都依此結構運作，**請整層複製，不要拆散**。

## 安裝（摘要）

完整程序見 [`安裝指南.md`](.opencode/ui-redesign-kit/安裝指南.md)：

1. **複製套件**：把整個 `.opencode/` 複製到目標前端專案根目錄（若目標專案已有 `.opencode/agents/`，把兩個資料夾併入即可）。
2. **填設定檔**：依 `ui-profile-範本.md` 填寫 `ui-profile.md`（技術棧、指令、結構、測試慣例、**工具用 Node 絕對路徑**等）。
3. **工具初始化**：執行 `tools/setup.cmd`（互動式：讀 ui-profile 取 Node → **詢問 Chromium 安裝位置** → npm install → 下載瀏覽器）。
4. **自我驗證**：shot 截圖一次＋diff 比對一次，確認工具鏈通。
5. **（可選）**複製 `commands/ui-redesign.md` 到 `.opencode/commands/`，取得 `/ui-redesign` 命令。
6. 依專案情況調整少數必改項（產物根目錄、測試目錄名稱等，詳見安裝指南）。

### Chromium 安裝位置（setup.cmd 會詢問）

| 選項 | 位置 | 特點 |
|---|---|---|
| 1＝使用者快取共用 | `%LOCALAPPDATA%\ms-playwright`（Playwright 預設） | 約 150MB，本機所有 Playwright 專案共用；移植到新專案不需重下載 |
| 2＝專案內隔離 | `tools/.browsers/` | 約 300MB 完全放專案內（gitignore）；不寫入專案外任何位置；每個專案重新下載 |

## 使用方式

安裝後的詳細操作（每個階段會發生什麼、你的互動點、產物解讀、異常處理）見 [`使用手冊.md`](.opencode/ui-redesign-kit/使用手冊.md)。

在目標前端專案開啟 OpenCode，輸入：

```
/ui-redesign
素材：docs/designs/login-page.png
     docs/designs/login-spec.md
目標頁面：登入頁（/login）
特別要求：保留既有表單驗證邏輯
```

命令檔已把 `agent` 綁定為 `ui-redesign/orchestrator`，**不需手動切換 primary agent**。未安裝命令檔時，切換 primary agent 為 `ui-redesign/orchestrator` 後下達同樣內容亦可。

多頁任務建議以頁面為單位分批執行（每批一份產物資料夾）。

## 工具鏈 CLI 契約

所有工具：結束碼 `0`=成功；錯誤訊息到 stderr；`--help` 顯示用法（不需依賴與瀏覽器）。

| 工具 | 模式 | 重點 |
|---|---|---|
| `shot.cmd` | 截圖 | `--url-file <json>`（A2 決策：URL 走參數檔，shell 字串不含 `&;|`）＋viewport／wait／scale → PNG |
| `shot.cmd` | 量測 | `--measure <選擇器\|all>` → getBoundingClientRect＋getComputedStyle 的 JSON（座標、間距、字級、顏色） |
| `diff.cmd` | 比對 | `--align width\|exact` 內建對齊（以設計圖寬為基準，補白/裁切並標註）→ overlay 圖＋diff 標色圖＋差異百分比 JSON |
| `run.cmd` | 腳本執行 | 僅允許 `<產物根目錄>/<slug>/scripts/` 子樹內的 `.mjs`（realpath＋區段邊界驗證）；以工具用 Node 執行 |
| `setup.cmd` | 初始化 | 互動式：Node 路徑確認 → 瀏覽器位置選擇 → npm install → playwright install |

**輸出路徑契約**：所有輸出限 `<產物根目錄>/<slug>/.artifacts/` 子樹（run 限 `scripts/`），支援 `.worktrees/<任何名稱>/` 下的對應路徑；拒絕 `..` 跳脫與範圍外路徑（工具端驗證）。

## 產物結構

每次任務在目標專案產生（預設根目錄 `docs/ui-redesign/`，可設定）：

```
<產物根目錄>/<頁面slug>/
├── functional-baseline.md     功能基準（F-xx 固定 ID＋調整後基準；留本機）
├── design-spec.md             設計規格（每項標註來源等級；含設計外保留／另案維持現狀）
├── design-tokens.json         具名 token（顏色、字級、間距、圓角…，框架無關）
├── component-mapping.md       新舊元件對照＋功能涵蓋對照（Feature Parity）＋新增功能對照（New Feature）
├── pending-questions.md       待確認清單＋使用者決策紀錄（PQ 設計決策／FQ 功能取捨／NF 新增功能）
├── visual-report.md           最終視覺報告（含設計外保留項、NF 已裁決未出現項、需要確認）
├── functional-report.md       功能回歸報告（含調整後基準、功能取捨與新增功能對照）
├── code-review.md             程式審核報告（含功能取捨／新增功能核對與調整後基準核對）
├── scripts/                   客製回歸腳本（可累積成回歸資產）
└── .artifacts/                截圖、overlay、diff PNG（同其他產物均留本機）
    └── r1/、r2/ …             每輪一個子資料夾
```

**目標前端專案**的 `.opencode/`、`/docs/` 整層忽略、無例外，文字／JSON／`scripts/`／截圖全部不提交；不得強制 add、取消忽略或搬到受追蹤位置變相提交。只有程式碼與正式 `test/` 等非忽略檔案可經核准 commit。**本套件來源 repo** 的 agent、kit 發佈原始碼與正式設計書仍受追蹤，不改成整層忽略。

ignored docs 沒有分支歷史，Git 合併成功後仍須**本機檔案同步**到目的分支實際工作目錄的 docs；不能假設主工作區是 main。建立 worktree 前複製原 docs 作起點，並在 worktree 外保存來源／目的基準與內容快照；合併前預覽計畫，目的單改保留、雙改不同停下裁決、來源刪除逐項確認。同步逐檔驗證成功（或明確同意丟棄對應未保留資料）後，才拆 junction／remove；失敗保留現場。完整程序見 [`worktree-procedures.md`](.opencode/ui-redesign-kit/worktree-procedures.md)；`.opencode/` 不整層回拷。

## 重要設計決策

- **A1（worktree 路徑策略，實測定案）**：subagent 的 session 工作根固定為主工作區（無 `workdir` 參數可傳）；worktree 情境下 edit 一律以 `.worktrees/ui-<slug>/` 開頭，權限雙前綴樣式涵蓋此路徑。
- **A2（URL 傳遞）**：URL 先寫入 gitignored 參數檔（`<slug>/.artifacts/url-args.json`），工具以 `--url-file` 接收檔案路徑——shell 白名單得以維持 `&;/|` 串接 deny，URL 查詢字串不需編碼。
- **D1（本機產物保存）**：目標 `.opencode/`、`/docs/` 全忽略、無例外；產物不提交。worktree 外記錄持久基準，Git 成功合併後另做安全本機 docs 同步及逐檔驗證，通過才清除；詳見安裝指南第 8／11 項與內建程序 §2。
- **F1（功能取捨閘門）**：baseline 功能以 `F-xx` 固定編號；設計未涵蓋者一律開 `FQ` 由使用者裁決，階段 1 有功能對照閘門、階段 2 前有 developer 預檢，未裁決不得凍結或自行移除。
- **F2（新增功能閘門）**：設計稿有、舊版沒有的互動功能以 `NF-xx` 固定編號（與 `F-xx` 分開編號空間）；一律開 NF 由使用者裁決納入／不納入／另案，需要新 API／事件／資料流者標註「超出 UI 還原範圍」。功能對照閘門為**雙向**（`F-xx` 舊→新、`NF-xx` 新→舊），納入者要有 design-spec 規格才可實作，不納入／另案者不得出現在程式與畫面。

## 已知限制

1. **像素比對的極限**：字體渲染、反鋸齒、縮放會造成偽差異；差異百分比是參考值，判讀以 overlay 圖為準。
2. **靜態素材的天然限制**：單張設計圖無法涵蓋 hover／focus／載入中／RWD 等狀態——靠決策點向使用者確認補齊。
3. **瀏覽器單一資源**：三個角色的瀏覽器工作由 orchestrator 序列化，是流程中的等待點。
4. **Windows 導向**：工具以 `.cmd`（CRLF）＋PowerShell 輔助實作；其他平台需自行調整（歡迎 PR）。
5. **npm 生態預設**：test／lint／build 的 shell 白名單字串預設為 `npm …`，非 npm 專案依安裝指南第 6 項調整。

## 需求

- [OpenCode](https://opencode.ai/)（支援 V2 agent 格式：子資料夾命名空間、有序 `permissions`）
- 目標前端專案（Git 管理）
- **工具用 Node ≥ 20**（建議 v24；與專案 Node 版本無關，兩者分離運作）

## 驗測

工具是否運作正確？依三層驗測程序確認（套件層自動腳本、OpenCode 層手動檢查、端到端試跑）：見 [`驗測清單.md`](.opencode/ui-redesign-kit/驗測清單.md)。

## 設計文件

完整的設計規格（九節架構、七階段流程、逐條權限模型、異常處理表、審核軌跡）見 [`docs/2026-11-11-UI重構Agent團隊-設計書.md`](docs/2026-11-11-UI重構Agent團隊-設計書.md)；設計前的 ChatGPT 討論稿（OpenCode 編排研究筆記）見 [`docs/OpenCode_Web_UI_Agent_Orchestration_Guide.md`](docs/OpenCode_Web_UI_Agent_Orchestration_Guide.md)。

## License

[MIT](LICENSE)
