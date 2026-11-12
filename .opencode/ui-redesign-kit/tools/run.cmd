@echo off
chcp 65001 >nul
rem run.cmd — UI 重構工具包：執行 <產物根目錄>/<slug>/scripts/ 內的客製腳本（詳見 run.mjs 檔頭註解與 --help）
rem 用法：cmd /c .opencode\ui-redesign-kit\tools\run.cmd <腳本.mjs> [參數…]
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
"%TOOL_NODE%" "%~dp0run.mjs" %*
exit /b %ERRORLEVEL%
