@echo off
chcp 65001 >nul
rem shot.cmd — UI 重構工具包：截圖與頁內量測（詳見 shot.mjs 檔頭註解與 --help）
rem 用法：cmd /c .opencode\ui-redesign-kit\tools\shot.cmd --url-file <URL 參數檔> [選項] --out <路徑>
rem 工具用 Node 與專案 Node 分離：一律經 .tool-node.cmd（setup.cmd 產生）取得 TOOL_NODE。
if not exist "%~dp0.tool-node.cmd" (
  echo 錯誤：找不到 .tool-node.cmd（工具用 Node 設定檔），請先執行 setup.cmd。 1>&2
  exit /b 3
)
call "%~dp0.tool-node.cmd"
if not defined TOOL_NODE (
  echo 錯誤：.tool-node.cmd 未定義 TOOL_NODE，請重新執行 setup.cmd。 1>&2
  exit /b 3
)
"%TOOL_NODE%" "%~dp0shot.mjs" %*
exit /b %ERRORLEVEL%
