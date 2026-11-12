---
description: UI 重構：以設計素材還原既有前端專案的目標頁面（基準建立 → 決策 → 實作 → 視覺迴圈 → 驗收 → 交付）
agent: ui-redesign/orchestrator
subagent: false
---
以下為使用者的任務輸入，請以 `ui-redesign/orchestrator` 的身分依七階段流程執行：

$ARGUMENTS

---
**輸入格式說明**（`$ARGUMENTS` 應為以下結構；解析後缺「素材」或「目標頁面」時，用 question 向使用者補問，不要自行推測）：

```
素材：<PNG/JPEG／HTML 原型路徑或網址／規格文件位置，可多行>
目標頁面：<頁面清單>
特別要求：（可省略）
```

**執行提醒**：開場鐵律是先讀 `.opencode/ui-redesign-kit/ui-profile.md`；檔案不存在時以 `ui-profile-範本.md` 為提綱向使用者蒐集必要欄位、產生檔案，**經使用者確認後**才開始正式流程。多頁批次建議以頁面為單位分批執行（每批一份產物資料夾）。
