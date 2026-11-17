# Release Notes（草稿）

供貼上 GitHub Releases 使用的短版內容。完整版本紀錄見 [`CHANGELOG.md`](../CHANGELOG.md)。

---

## 功能取捨閘門與調整後基準

**commit**：`1ea3bc1` ｜ **日期**：2026-11-17 ｜ **前一版**：`9887e36`

> 舊版有、新設計沒畫到的功能，從此不會再默默消失。每個既有功能都有固定編號 `F-xx`，設計未涵蓋者一律開 `FQ` 由你裁決「保留／移除／調整／另案」；未裁決不得凍結規格，developer 也不能自行刪功能。移除功能導致測試變少時，改以「調整後基準」判定，不再一律判 FAIL。

### 重點

- **`F-xx` 功能編號**：`functional-qa` 為每個既有功能建立 `F-01` 起固定 ID，全程不得重編；漏列時以附錄補號，不動既有 ID。
- **功能涵蓋對照（Feature Parity）**：`component-mapping.md` 逐項標註「設計涵蓋（是／部分／否）、對應區塊、處理狀態」。
- **`FQ` 功能取捨問題**：`pending-questions.md` 拆成 `PQ`（設計決策）與 `FQ`（功能取捨）；每個 FQ 必含舊行為、設計缺口、移除影響與四種選項。
- **階段 1 功能對照閘門**：`F-xx` 缺對照或未涵蓋卻沒開 FQ，就重派 `design-analyzer` 補齊（新 session、不計輪），未過不得進決策點。
- **階段 1.5 先問功能取捨、再問設計決策**：FQ 全數裁決、功能全有對照、設計外保留寫明視覺規格等 5 個條件都成立才凍結。
- **設計外保留（依使用者裁決）**：`design-spec.md` 新增區塊，寫明保留／調整／另案維持現狀功能的位置與視覺處理。
- **「需要確認」攔截**：`visual-report.md` 新增「設計外保留項」與「需要確認」兩欄；出現未記載的多出區塊時，orchestrator 必須先處理，**未清空前不得進階段 4**。
- **調整後基準（經使用者同意）**：`functional-baseline.md` 記錄扣除項的 FQ、原因、扣除數、同意日期與替代測試；測試與回歸腳本改以「原始基準 − 核准扣除」判定。
- **功能取捨對帳**：`functional-report.md` 以 `T = f + a + b + c + d + e` 統計，PASS 時「未裁決缺失」必須為 0。

### 行為變更

- `developer` 實作前必須做「功能取捨預檢」，缺資料就停手回報；**不得以「設計稿沒畫」為由移除、隱藏或停用既有功能**。
- 因 FQ 裁決需刪改測試／腳本時，先提「FQ 測試調整清單」，經你逐項同意後才可動，並優先改寫維持項數。
- 回歸腳本不再由 `developer` 執行或判定，改由 `functional-qa` 在階段 4 執行與驗證。
- `reviewer` 需求符合度第 2 步改為「功能取捨查核」，並同時檢查 `scripts/` 的 diff；裁決保留卻實作缺失列「嚴重」。
- 交付由固定四項改為**固定五項**，新增「功能取捨清單」。
- 閘門重派與「需要確認」回決策點重新凍結，皆**不計輪數**。

### 修正

- 修掉「先改版再盤點」導致既有功能被誤刪的盲點。
- 修掉「移除功能 → 測試變少 → 永遠 FAIL」的死結（未經核准的刪除／放寬仍判 FAIL）。
- 文件錯字（互携 → 互搶）與來源等級表述統一。

### 文件同步

README、使用手冊（含 3 則新 FAQ）、驗測清單（1.1 增至 34 項、3.x 增至 21 項）、設計書（新增目標第 5 項與 §15 第 13 項限制）皆已更新。

### 升級注意

本次為**產物格式與流程行為變更**，非向後相容：`pending-questions.md`（多「類型」欄）、`component-mapping.md`（補 Feature Parity）、`functional-baseline.md`（補 `F-xx`、調整後基準）、`design-spec.md`（補設計外保留）、三份報告（補對應欄位）都需遷移。進行中的任務建議在階段 1 結束前後再套用新版。

### 變更檔案

```
.opencode/agents/ui-redesign/orchestrator.md
.opencode/agents/ui-redesign/design-analyzer.md
.opencode/agents/ui-redesign/developer.md
.opencode/agents/ui-redesign/functional-qa.md
.opencode/agents/ui-redesign/reviewer.md
.opencode/agents/ui-redesign/visual-qa.md
.opencode/ui-redesign-kit/使用手冊.md
.opencode/ui-redesign-kit/驗測清單.md
docs/2026-11-11-UI重構Agent團隊-設計書.md
README.md
```

> 工具程式碼（`.opencode/ui-redesign-kit/tools/**`）本次無變更。
