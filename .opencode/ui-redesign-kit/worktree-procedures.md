# worktree 程序（套件內建／情境二通用程序）

> **定位**：本檔是 ui-redesign 套件的**內建 worktree 程序**。目標專案的 ui-profile「流程程序文件」欄位**未填**時，`ui-redesign/orchestrator` 依本檔執行；**填了**自己專案的程序文件時，以該文件為主體＋套件插入規則（見 orchestrator 指令「worktree 程序」的情境一），本檔不使用。
> 你可以直接修改本檔微調程序（例如調整命名或依賴方式），修改後即生效，不需動 agent 檔案。

## 命名約定

- worktree 目錄：`.worktrees/ui-<slug>`（`<slug>` 為英文小寫連字號）
- 分支：`ui-redesign/<slug>`（分支名**刻意不同於目錄**，避免與 feature／bugfix 等既有分支混淆）
- 隔離區目錄名約定為 `.worktrees/`；若專案沿用不同名稱，需同步 agent 權限樣式（見安裝指南第 5 項）

## 建立（在主工作區根目錄執行；除特別標註外）

1. `git rev-parse HEAD` 取得起點 sha，記為**比較基準**。
2. 由任務產生英文小寫連字號 `<slug>`；**先檢查殘留**：`Test-Path .worktrees/ui-<slug>` 與 `git branch --list ui-redesign/<slug>`——已存在時**不硬蓋**，用 `question` 請使用者決定（換名稱或先處理殘留）。
3. `git worktree add .worktrees/ui-<slug> -b ui-redesign/<slug> [起點]`。
4. **依賴**（**例外：此步的 `npm ci` 以該 worktree 絕對路徑為 `workdir`**，timeout 600000；若原來已 junction node_modules，**必先拆除連結** `cmd /c rmdir .worktrees\ui-<slug>\node_modules` 再執行 `npm ci`，否則會覆寫到主工作區 node_modules）：
   - 任務會改動 `package.json`／lockfile → 在 worktree 內以**專案環境**執行 `npm ci`。
   - 否則 junction 主工作區 `node_modules`：
     ```powershell
     New-Item -ItemType Junction -Path .worktrees/ui-<slug>/node_modules -Target (Resolve-Path node_modules).Path
     ```
     （`-Target` 必須是**絕對路徑**；建立後以 `Test-Path .worktrees/ui-<slug>/node_modules` 下主要套件的存在性確認。）
5. **kit junction**：讓 worktree 內讀得到 ui-profile、執得到 tools：
   ```powershell
   New-Item -ItemType Directory -Path .worktrees/ui-<slug>/.opencode -Force
   New-Item -ItemType Junction -Path .worktrees/ui-<slug>/.opencode/ui-redesign-kit -Target <主工作區絕對路徑>\.opencode\ui-redesign-kit
   Test-Path .worktrees/ui-<slug>/.opencode/ui-redesign-kit/ui-profile.md   # 必須為 True，否則停止並回報
   ```
6. 複製 `.env`：`Copy-Item .env .worktrees/ui-<slug>/.env`。
7. 記下 worktree **絕對路徑**與比較基準；**之後工作期間的 bash**（test/lint/build、dev server、產物與測試檔讀寫、developer 編輯、QA 瀏覽器工作、git add/commit、交付與清除前的 git status）**一律以該 worktree 絕對路徑為工作目錄（bash 的 `workdir` 參數）**；worktree 的建立、**清除全程**、commit 後的 merge 在主工作區執行（orchestrator 派工規則的例外清單）。

## 清除（順序固定，**不可跳過拆連結**；步驟 1 在 worktree 內執行，其餘在主工作區根目錄執行）

1. **產物未 commit 時先經使用者明確同意丟棄**；在 worktree 內執行 `git status --short` 確認未追蹤產物並回報（**空輸出時不可當作「沒有產物」**——被 `.gitignore` 忽略的產物不會出現，需以檔案存在性或 `git status --short --ignored` 複查）。
2. `cmd /c rmdir .worktrees\ui-<slug>\node_modules`（只拆 node_modules 連結；實體目錄或不存在的路徑會失敗，失敗可忽略）。
3. `cmd /c rmdir .worktrees\ui-<slug>\.opencode\ui-redesign-kit`（拆 kit junction；**失敗即中止清除並回報**——連結未拆則下一步可能跟隨刪除主工作區 kit。判準：若路徑本來不存在 → 視為已拆除；若存在但 rmdir 失敗 → 中止）。
4. `git worktree remove --force .worktrees/ui-<slug>`（--force 會刪除未追蹤檔）。
5. `git worktree list` 確認；分支 `ui-redesign/<slug>` 依使用者決定保留或刪除（刪除為 ask，需使用者確認）。

> **警告（資料遺失風險，與 node_modules 同等級）**：若 node_modules 是 junction，直接 `git worktree remove --force` 在 Windows 上可能**跟隨連結**，把主工作區的 node_modules 內容一併刪除；kit junction 被跟隨刪除則會把主工作區的 `.opencode/ui-redesign-kit`（agent、tools、ui-profile）**整包刪除**——該目錄被 `.gitignore` 忽略，**無法從版控還原**。拆除兩個 junction 的步驟（第 2、3 步）**絕不可省略或後置**。
