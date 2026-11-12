@echo off
chcp 65001 >nul
rem setup.cmd — UI 重構工具包初始化（設計書 §5.3 第 7 項、§6.1 Node 路徑橋接）
rem 流程：①讀 ui-profile 的「工具用 Node 絕對路徑」（空則自動探測並提示確認）
rem       ②產生 .tool-node.cmd（一行：set "TOOL_NODE=<絕對路徑>"；gitignored）
rem       ③以工具用 Node 執行 npm install（裝 playwright、pixelmatch、pngjs 到 tools/node_modules）
rem       ④以工具用 Node 執行 playwright 的 Chromium 下載（一次性，約 150MB）
rem       ⑤列印自我驗證提示（對應 安裝指南.md 第 9 項）
rem 說明：一律不碰專案 package.json 與專案 Node；本檔執行於 tools/ 目錄（%~dp0）。
rem   暫存檔 %TEMP%\uirk-node.txt 為覆蓋式使用，不另行清理。
setlocal EnableExtensions
set "TOOLS_DIR=%~dp0"
set "PROFILE_FILE=%~dp0..\ui-profile.md"
set "NODE_EXE="
set "NODE_SOURCE="
set "NODE_TEMP_FILE=%TEMP%\uirk-node.txt"

echo ===UI 重構工具包初始化（setup.cmd）===
echo.

rem ── 步驟 1／5：取得工具用 Node（ui-profile 優先；未指定則探測並提示確認）──
echo [步驟 1／5] 讀取 ui-profile 的「工具用 Node 絕對路徑」
if exist "%PROFILE_FILE%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=Get-Content -Raw -LiteralPath '%PROFILE_FILE%'; $lines=($t -split '\r?\n') | Where-Object { $_ -match '工具用' -and $_ -match 'node\.exe' }; foreach($l in $lines){ $m=[regex]::Match($l,'[A-Za-z]:\\[^\s，,；;|`]*node\.exe','IgnoreCase'); if($m.Success){ Write-Output $m.Value; break } }" > "%NODE_TEMP_FILE%"
  set /p NODE_EXE=<"%NODE_TEMP_FILE%"
)
if defined NODE_EXE set "NODE_SOURCE=ui-profile"
if defined NODE_EXE echo   已從 ui-profile 取得：%NODE_EXE%
if not defined NODE_EXE echo   ui-profile 未指定（或檔案不存在），改為自動探測。

if not defined NODE_SOURCE (
  where node > "%NODE_TEMP_FILE%" 2>nul
  set /p NODE_EXE=<"%NODE_TEMP_FILE%"
  if defined NODE_EXE set "NODE_SOURCE=系統 PATH（where node）"
)
if not defined NODE_SOURCE (
  for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$dirs=@(($env:APPDATA + '\nvm'), ($env:LOCALAPPDATA + '\nvm')) | Where-Object { Test-Path -LiteralPath $_ }; if($dirs){ Get-ChildItem -LiteralPath $dirs -Filter node.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName }"`) do set "NODE_EXE=%%i"
  if defined NODE_EXE set "NODE_SOURCE=nvm 常見路徑探測（%%APPDATA%%\nvm、%%LOCALAPPDATA%%\nvm；多版本取最高）"
)
if not defined NODE_SOURCE (
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
)
if defined NODE_EXE if not defined NODE_SOURCE set "NODE_SOURCE=Program Files 探測"

if not defined NODE_EXE (
  echo 錯誤：找不到可用的 Node。請在 ui-profile.md 填寫「工具用 Node 絕對路徑」後重跑 setup.cmd， 1>&2
  echo 或手動建立 .tool-node.cmd（內容一行：set "TOOL_NODE=<工具用 Node 絕對路徑>"）。 1>&2
  exit /b 1
)

echo   探測來源：%NODE_SOURCE%
echo   工具用 Node：%NODE_EXE%
"%NODE_EXE%" --version
if errorlevel 1 (
  echo 錯誤：指定的 Node 無法執行（--version 失敗）。 1>&2
  exit /b 1
)

rem 探測得來的 Node 需經使用者確認（ui-profile 指定的不需重複確認）
if not "%NODE_SOURCE%"=="ui-profile" (
  echo   此 Node 來自自動探測，請確認上方路徑與版本符合預期。
  choice /c yn /m "是否使用此 Node 進行安裝"
  if errorlevel 2 (
    echo 已取消，未變更任何檔案。請改於 ui-profile.md 填寫後重跑 setup.cmd。
    exit /b 1
  )
)

rem ── 步驟 2／5：產生 .tool-node.cmd（機器特定內容，已由專案 .gitignore 排除）──
echo.
echo [步驟 2／5] 產生 .tool-node.cmd
> "%TOOLS_DIR%.tool-node.cmd" echo set "TOOL_NODE=%NODE_EXE%"
echo   已寫入：%TOOLS_DIR%.tool-node.cmd

rem ── 步驟 3／5：npm install（以工具用 Node 直接執行 npm-cli.js，不依賴 PATH 上的 npm）──
echo.
echo [步驟 3／5] 安裝工具依賴（playwright、pixelmatch、pngjs）
for %%i in ("%NODE_EXE%") do set "NODE_HOME=%%~dpi"
set "NPM_CLI=%NODE_HOME%node_modules\npm\bin\npm-cli.js"
if not exist "%NPM_CLI%" (
  echo 錯誤：找不到 npm 執行入口（%NPM_CLI%）。請確認此 Node 安裝完整（含 npm）。 1>&2
  exit /b 1
)
pushd "%TOOLS_DIR%"
"%NODE_EXE%" "%NPM_CLI%" install
set "NPM_EXIT=%ERRORLEVEL%"
popd
if not "%NPM_EXIT%"=="0" (
  echo 錯誤：npm install 失敗（結束碼 %NPM_EXIT%）。 1>&2
  exit /b %NPM_EXIT%
)
echo   npm install 完成。

rem ── 步驟 4／5：下載 Playwright Chromium（以 tools 內已安裝的 playwright cli 執行）──
echo.
echo [步驟 4／5] 下載 Playwright Chromium（一次性，約 150MB）
"%NODE_EXE%" "%TOOLS_DIR%node_modules\playwright\cli.js" install chromium
if errorlevel 1 (
  echo 錯誤：playwright install chromium 失敗（網路或磁碟問題）。 1>&2
  exit /b 1
)
echo   Chromium 下載完成。

rem ── 步驟 5／5：自我驗證提示（安裝指南.md 第 9 項：shot 一次＋diff 一次確認工具鏈通）──
echo.
echo [步驟 5／5] 安裝完成。請執行以下自我驗證：
echo   1. shot.cmd --help 與 diff.cmd --help 可正常顯示用法（不需瀏覽器與依賴）。
echo   2. 以測試頁截圖一次（shot）＋兩張圖比對一次（diff），確認 Playwright Chromium 可啟動。
echo   3. 確認 .tool-node.cmd 已被專案 .gitignore 排除（機器特定內容，不進版控）。
echo   4. 日後工具用 Node 路徑失效時，重新執行本 setup.cmd 即可。
exit /b 0
