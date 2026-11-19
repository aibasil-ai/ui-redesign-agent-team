# worktree 程序（套件內建／情境二通用程序）

> **定位**：ui-profile「流程程序文件」未填時，orchestrator 依本檔執行；有填時以專案程序為主體，但本檔的「本機 docs 保存與同步」及安全閘門一律適用，不得被自訂程序略過。
> **適用範圍**：以下是安裝後的目標前端專案。套件來源 repo 的 agent、kit 與正式設計書仍受 Git 追蹤，不套用整層忽略政策。

## 1. 不可變更的政策與命名

- 目標 `.gitignore` 保留 `.opencode/`、`/docs/`、`.worktrees/` 整層忽略，底下所有文字、JSON、`scripts/`、`.artifacts/` 都不提交。禁止 `git add -f`、取消忽略、例外放行或搬到受追蹤目錄變相提交。正式 `test/` 與產品程式碼仍可經使用者核准後提交。
- worktree 目錄 `.worktrees/ui-<slug>`；分支 `ui-redesign/<slug>`；名稱重複時停止詢問，不覆寫。
- **主工作區**只指本次啟動與安裝 kit 的工作目錄，**不代表 main 分支**。**目的工作目錄**是使用者指定目的分支實際 checkout 的工作目錄；可能是另一個 worktree。
- ignored docs 沒有 Git 分支層級歷史。`git merge` 只合併受追蹤程式碼；成功後另做**本機檔案同步**，不是 Git 帶回 docs。`.opencode/` 不從 worktree 整層複製回去（kit 為 junction，另含機器路徑與依賴）。

## 2. 本機 docs 保存與同步（所有情境的共同規範）

這是由 orchestrator 逐步執行的程序，**不是已提供的自動同步工具**。檔案管理透過經主 session 核准的 shell 操作執行；不得藉此修改產品程式碼或繞過 edit 禁令。任何權限遭拒就停止，不改用子代理或其他工具繞過。

### 2.1 路徑與持久基準（建立 worktree 前）

1. 向使用者確認來源工作目錄、目的分支與預期目的工作目錄，逐條執行：
   ```powershell
   git rev-parse HEAD
   git worktree list --porcelain
   git ls-files -- .opencode docs
   git check-ignore .opencode/ui-redesign-kit/ui-profile.md docs/ui-redesign/檢查.md docs/ui-redesign/檢查/scripts/檢查.mjs
   ```
   記下程式碼起點 SHA。以 `branch refs/heads/<目的分支>` 同筆的 `worktree` 欄確認目的絕對路徑，再於該目錄執行 `git branch --show-current`、`git rev-parse --show-toplevel` 與 `git status --short`。目的未 checkout、detached、路徑不明／不存在／不是同一 repo，或有未處理的變更時停止詢問；**不得擅自 git switch**。目標 `.opencode`／docs 若已被追蹤或未完整忽略，停止由使用者處理，不自行移除追蹤。
2. 建立唯一的 `<保存ID>`（日期時間＋slug，已存在就換 ID，不重用），保存根固定為：
   `<主工作區絕對路徑>/.opencode/ui-redesign-local/<保存ID>/`。
   此路徑必須是實體本機目錄，位於預定移除的 worktree **之外**，不是 kit junction 內、不在 docs 內、不在 `.worktrees/` 內，且由 `.opencode/` 忽略。連同路徑祖先都要先做下節安全檢查。若主工作區本身將被移除，先請使用者指定另一個可持久保存且已忽略的本機位置；無安全位置就停止。不得隨 worktree 清除保存根。
3. 來源與目的 `docs/` 都必須存在且是安全實體目錄；缺少時停止詢問，可由使用者確認建立空 docs 後重新盤點，**不能把不存在當成已知空基準**。暫停相關寫入後，分別列出完整檔案與目錄樹，保存：
   - `session.json`：格式版本、保存ID、repo 識別（Git common dir 絕對路徑）、起點 SHA、來源／worktree／目的絕對路徑、來源／目的分支、docs 絕對路徑。
   - `source-base.json`、`target-base.json`：每個相對路徑的種類（file／directory）、存在狀態；檔案另存 SHA-256。清單完整列出隱藏檔與空目錄，清單中不存在的路徑定義為 `absent`，不是漏掃。來源與目的同目錄時也要明確記錄兩個基準角色。
   - `source-base/`、`target-base/`：逐檔備份原始內容（包含 `.artifacts/`），保留相對路徑並逐檔校驗 SHA-256；另記 manifest 本身的 SHA-256 於 `session.json`。基準建立後不可覆寫。
   以 `Get-FileHash -Algorithm SHA256 -LiteralPath <檔案>` 計算內容雜湊，**不可用時間戳或檔案大小代替**。任何讀取／備份／校驗失敗，基準不完整即停止，尚未建立 worktree。
4. 未使用 worktree 時，也在開工前保存來源 docs 快照供本機審核；docs 直接保留原地，不需合併或跨目錄同步。階段 1 功能基準與腳本經使用者確認後，另存不可覆寫的 `review-base/` 內容快照及 `review-base.json`（相對路徑、存在／種類、SHA-256），把清單本身的 SHA-256 記入 session，供後續 reviewer 比對 ignored 腳本；此快照**不取代**同步用的 source-base／target-base。

### 2.2 每次盤點、複製、寫入、刪除前的路徑安全

- 使用絕對路徑與 `-LiteralPath`；相對路徑不得有磁碟代號、UNC、絕對前綴、空區段、`.`、`..`、NTFS 替代資料流 `:`。以正規化後的 docs 根＋路徑區段邊界確認仍在該 docs 範圍內；不能用單純字串前綴（`docs-other` 不等於 `docs`）。
- 先檢查根、每層祖先，再以 `Get-ChildItem -Force -LiteralPath <單層目錄>` **逐層**列舉；檢查 `Get-Item -Force -LiteralPath <路徑>` 的 `Attributes`／`LinkType` 後才下探。發現 `ReparsePoint`、junction、symlink（含斷鏈）、無法識別的檔案類型或讀取權限錯誤就停止，**不跟隨、不略過、不直接遞迴 Copy-Item／Remove-Item**。同樣檢查保存根與備份；禁止任何連結把讀寫或刪除導向 docs／保存根之外。
- 大小寫碰撞、檔案／目錄互換、目的父路徑是檔案等結構衝突一律停止裁決；不自動清空目錄。目的既有檔若為硬連結也不得原地覆寫，無法安全判定時停止。複製採新暫存檔寫入、校驗後替換目錄項目，避免原地截斷連結到其他位置的內容。
- 每次動作前重新檢查父路徑與來源／目的雜湊，**不要只信最初掃描**。同步期間須暫停其他 agent／使用者寫入 docs；若做不到，或檔案在檢查間變動，停止重列計畫，不承諾能消除並行修改風險。

### 2.3 建立 docs 同步計畫（可在 Git 合併前預覽）

1. 重新以 `git worktree list --porcelain` 核對來源與目的映射及 repo 識別；核對 session／兩份基準格式、manifest 雜湊、快照內容雜湊與完整路徑。**無基準、基準損壞、目的改成未記錄的工作目錄、目的 docs 消失時都停止詢問**，不得把目前狀態補寫成「原始基準」。新目的若沒有任務開始前的可信基準，保留 worktree，由使用者逐項裁決／另行備份，不自動同步。
2. 重新盤點來源 worktree docs（S）與目的 docs（T）；以來源基準 Bs、目的基準 Bt 與 S、T 的**完整相對路徑聯集**分類；存在狀態也參與比較。檔案重新命名視為新增＋刪除，不猜測重新命名。

   | 條件 | 計畫 |
   |---|---|
   | S 與 Bs 相同（來源未改） | 保留 T，不論目的是否改動／新增／刪除 |
   | S 已刪除、Bs 原有檔案 | 列「來源刪除待確認」，**不自動刪目的檔**；T 已不存在則記已不存在 |
   | 來源有新增／修改且 S 與 T 相同 | 記「已同步」，不覆寫 |
   | 來源有新增／修改，T 與 Bt 相同 | 列新增／更新候選，須經使用者核准；若 Bs 與 Bt 原本不同且 T 不等於 S，改列「目的原有差異待裁決」 |
   | 來源有新增／修改，T 與 Bt 不同且 S 不等於 T（含目的刪除） | 列「雙方異動衝突」，停止交使用者裁決，不覆蓋 |

3. 目錄僅允許新增必要的安全父目錄；來源消失的目錄不自動刪除，空目錄異動另列清單。目的獨有檔案／目錄永遠不以鏡像方式移除。**不得使用 robocopy /MIR、/PURGE 或整個 docs 覆蓋**。
4. 在保存根的唯一 `sync-attempts/<嘗試ID>/` 子目錄寫 `sync-plan.json` 與可讀摘要，後續該次同步的 `pre-sync/`、`source-final/`、`source-final.json`、`sync-result.json` 也放這裡；每次重列計畫／重試用新 ID，不覆寫先前紀錄或快照。計畫包含來源／目的絕對路徑、相對路徑、Bs／Bt／S／T 雜湊或 absent、分類、動作、衝突／刪除／未解項。請使用者核准明確清單；刪除必須逐項明確同意（含來源刪除但目的改過者），拒絕刪除可記「依裁決保留目的」。衝突由使用者選來源／目的／人工整合／暫停，重列新內容與雜湊後再核准，不自行選擇。
5. 任何未裁決衝突不開始寫入；單純預覽或核准計畫**不代表已同步**。核准後內容變動則計畫失效，須重算再確認。

### 2.4 Git 成功後才同步、逐檔驗證

1. 先於來源 worktree 確認分支、`git status --short`，僅允許已核准提交且無未提交程式碼的狀態，記錄來源 HEAD SHA；未提交程式碼不得被誤認已合併。在**目的分支實際工作目錄**確認分支、`git status --short` 與無既存合併狀態，取得使用者合併同意，再單獨執行 `git merge ui-redesign/<slug>`。若產生合併 commit，繁中訊息也須先審核。記錄退出碼與合併後 SHA，並用 `git merge-base --is-ancestor <來源已提交SHA> HEAD` 確認來源已納入，且 `git ls-files -u` 為空、無 MERGE_HEAD；「Already up to date」仍需核對祖先關係。**失敗、衝突或尚未完成的 merge 絕不能接著同步／拆 junction／remove**，保留現場詢問，不自行解衝突。
2. Git 合併成功後，重驗 2.3 的映射、忽略政策、基準與核准清單，重算 S／T。merge hook 或他人改動 docs 都會使舊計畫失效；停下重列。先在保存根 `pre-sync/` 逐檔備份即將覆寫／刪除的目的原內容並校驗；另在 `source-final/` 保存本次來源新增／修改的完整內容及 `source-final.json`（包括使用者選擇保留目的、未同步的來源版本），**不因衝突裁決而默默丟掉來源產物**。任一備份失敗就不寫入。
3. 只逐檔執行核准項目，保持 docs 內相對路徑：先建立安全父目錄，將來源以二進位複製至目的同目錄的唯一暫存檔，校驗來源與暫存 SHA-256，再以不跟隨連結的檔案替換完成；不得就地串流覆寫既有目的檔。只對已明確核准的**具體檔案**執行刪除，不遞迴刪目錄。每步錯誤立即停止，記錄已完成／未完成；不盲目重跑或自動回滾覆蓋他人修改。
4. 逐檔讀回核准項目：新增／更新／同內容項目的目的 SHA-256 必須符合核准值；刪除項目須確認不存在；保留目的項目也核對原核准雜湊／存在狀態。重新完整盤點目的，確認未核准項目沒有被同步程序更動，來源最終盤點與已核准來源一致。保存 `sync-result.json`（目的絕對路徑、逐檔預期／實際雜湊、已保留來源位置、完成／失敗／未解清單、Git 合併證據）。
5. 全部校驗通過且未解項為零，才回報「本機產物同步驗證成功」。**Git 合併成功不等於同步成功**；部分成功、磁碟滿／權限拒絕、校驗不符等一律不通過清除閘門，保留 worktree、基準、來源與備份並回報。

## 3. 建立 worktree（使用者核准後，在主工作區執行）

1. 完成 §2.1 的持久基準及安全檢查，記下起點 SHA；`.worktrees/` 根與祖先也須為安全實體目錄，不能跟隨連結建立 worktree。以 `Test-Path .worktrees/ui-<slug>` 與 `git branch --list ui-redesign/<slug>` 檢查殘留（斷鏈也算殘留，用 Get-Item 複查），已存在就詢問。
2. 單獨執行 `git worktree add .worktrees/ui-<slug> -b ui-redesign/<slug> [起點]`，失敗即停止。
3. 在執行任何 agent 前，依 §2.2 將 `source-base/` 的 docs 內容逐檔複製到新 worktree 的實體 `docs/` 作起點，保留相對路徑並逐檔核對 source-base 清單。若已有非預期 docs、基準不符或忽略政策未生效，停止保留現場，不覆蓋。新建空 docs 根必須位於已核對的 worktree 根內。不可只複製本次 slug。
4. **kit junction**：
   ```powershell
   New-Item -ItemType Directory -Path .worktrees/ui-<slug>/.opencode -Force
   New-Item -ItemType Junction -Path .worktrees/ui-<slug>/.opencode/ui-redesign-kit -Target <主工作區絕對路徑>\.opencode\ui-redesign-kit
   Test-Path .worktrees/ui-<slug>/.opencode/ui-redesign-kit/ui-profile.md
   ```
   最後必須 True，否則停止。
5. **依賴**：任務需改 package／lockfile 時，經核准在 worktree 以**專案 Node**執行 `npm ci`（`workdir` 為 worktree 絕對路徑、timeout 600000）。若已有 node_modules junction，**必先** `cmd /c rmdir .worktrees\ui-<slug>\node_modules` 且確認連結已拆除，失敗不可繼續 npm ci。否則：
   ```powershell
   New-Item -ItemType Junction -Path .worktrees/ui-<slug>/node_modules -Target (Resolve-Path node_modules).Path
   ```
   `-Target` 必須絕對路徑，檢查主要套件存在。來源依賴缺失先詢問，不擅自安裝。
6. `.env` 僅在專案允許、來源存在且使用者同意時複製；不生成、不改值、不納入 docs 保存。未提供而影響啟動時停止詢問。
7. 記下 worktree 絕對路徑、比較 SHA 與保存根。工作期間 test／lint／build、dev server、產物讀寫、`git add`／commit／status 一律在 worktree；建立與拆 junction／remove 在主工作區；**merge 在目的工作目錄**。各重要 shell 指令單獨執行，檔案管理腳本也須先展示用途與清單、取得 shell 核准。

## 4. 合併／保留／清除（順序固定）

1. 使用者選擇：
   - **保留 worktree**：回報絕對路徑、分支、保存根與未解項；不強迫合併、同步或清除。
   - **合併並清除**：依 §2.3 預覽並取得核准 → §2.4 Git 合併成功 → 本機 docs 同步及驗證成功 → 才進下列拆連結／remove。
   - **直接丟棄**：列出程式碼未提交／未合併變更、全部 ignored docs 與其他未保留檔案的具體清單、絕對路徑與後果，請使用者**明確同意丟棄對應資料**，不把一般 remove 同意視為資料丟棄同意。未同意就保留。此為不合併／不同步的唯一例外；既有保存根仍保留。
2. **清除前盤點**：在 worktree 跑 `git status --short`、`git status --short --ignored`，另安全列舉 docs 與其他 ignored 本機檔案；空 status 不代表沒有產物。正常路徑須有「Git 合併成功＋同步逐檔驗證成功」紀錄，且來源與目的 docs 自驗證後未變、來源 HEAD 未再變動並仍為目的 HEAD 的祖先；其他將隨 remove 遺失的資料也須已保存驗證或經逐項同意丟棄。任何失敗／未解項保留 worktree，**不得先拆 junction**。
3. 在主工作區執行 `cmd /c rmdir .worktrees\ui-<slug>\node_modules`（**只拆連結**）。不存在或已證實為實體目錄時，失敗可忽略；**仍存在 junction／類型不明時失敗即中止**，不得讓 remove 跟隨連結。
4. 再執行 `cmd /c rmdir .worktrees\ui-<slug>\.opencode\ui-redesign-kit`。路徑本來不存在視為已拆；存在但 rmdir 失敗**中止清除並回報**。若不是預期 junction，停止詢問，不遞迴刪除。
5. 確認兩個 junction 均不存在、保存根與成果完整，重新取得使用者 remove 核准，才單獨執行 `git worktree remove --force .worktrees/ui-<slug>`；失敗保留殘留並回報，不改用遞迴刪除／prune。
6. `git worktree list` 確認；分支保留／刪除依使用者決定，刪分支另需確認。回報目的 docs **絕對路徑**、同步／保留／刪除清單、未解項與保存根位置；保存根不自動清除。

> **資料遺失警告**：`--force` 會移除未追蹤／ignored 資料；Windows 可能跟隨 junction 刪除主工作區 node_modules 或整個 kit，後者不受目標 Git 保護。**docs 保存與同步閘門 → 拆 node_modules → 拆 kit → remove** 的順序不可省略或後置。
