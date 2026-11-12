@echo off
chcp 65001 >nul
rem setup.cmd — UI 重構工具包初始化（設計書 §5.3 第 7 項、§6.1 Node 路徑橋接）
rem 流程：①讀 ui-profile 的「工具用 Node 絕對路徑」（空則自動探測並提示確認）
rem       ②詢問 Playwright Chromium 的安裝位置（使用者快取共用／專案內隔離）
rem       ③產生 .tool-node.cmd（TOOL_NODE＋選專案內時再加 PLAYWRIGHT_BROWSERS_PATH；gitignored）
rem       ④以工具用 Node 執行 npm install（裝 playwright、pixelmatch、pngjs 到 tools/node_modules）
rem       ⑤以工具用 Node 執行 playwright 的 Chromium 下載（一次性，約 150MB；位置依步驟②）
rem       ⑥列印自我驗證提示（對應 安裝指南.md 第 9 項）
rem 說明：一律不碰專案 package.json 與專案 Node；本檔執行於 tools/ 目錄（%~dp0）。
rem   暫存檔 %TEMP%\uirk-node.txt 為覆蓋式使用，不另行清理。
rem   PLAYWRIGHT_BROWSERS_PATH 由 .tool-node.cmd 持久化——所有工具 .cmd 經 call 載入後，
rem   Playwright 於執行期自動到該位置找瀏覽器，無需額外參數。
setlocal EnableExtensions
set "TOOLS_DIR=%~dp0"
set "PROFILE_FILE=%~dp0..\ui-profile.md"
set "NODE_EXE="
set "NODE_SOURCE="
set "NODE_TEMP_FILE=%TEMP%\uirk-node.txt"
set "BROWSERS_PATH="

echo ===UI 重構工具包初始化（setup.cmd）===
echo.

rem ── 步驟 1／6：取得工具用 Node（ui-profile 優先；未指定則探測並提示確認）──
echo [步驟 1／6] 讀取 ui-profile 的「工具用 Node 絕對路徑」
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

rem ── 步驟 2／6：選擇 Playwright Chromium 瀏覽器安裝位置 ──
echo.
echo [步驟 2／6] 選擇 Playwright Chromium 瀏覽器的安裝位置
echo   兩種位置的差異：
echo     [1] 使用者快取共用（Playwright 官方預設：%LOCALAPPDATA%\ms-playwright）
echo         ・下載一次約 150MB，本機所有 Playwright 專案共用同一份，重複安裝不重複下載
echo         ・瀏覽器二進位位於專案目錄之外（使用者層級快取）
echo         ・套件移植到新專案時不需重新下載瀏覽器
echo     [2] 套件專案內隔離（%TOOLS_DIR%.browsers）
echo         ・瀏覽器完全放在專案內，不寫入專案目錄之外的任何位置
echo         ・約 300MB（完整版＋headless shell＋ffmpeg），已被專案 .gitignore 排除，不進版控
echo         ・移植到每個前端專案時都要重新下載一次
choice /c 12 /m "請選擇（1=使用者快取共用，2=專案內隔離）"
if errorlevel 2 goto browsers_project
set "BROWSERS_PATH="
echo   已選擇：使用者快取共用（Playwright 預設行為）。
goto browsers_done
:browsers_project
set "BROWSERS_PATH=%TOOLS_DIR%.browsers"
echo   已選擇：專案內隔離（%BROWSERS_PATH%）。
:browsers_done

rem ── 步驟 3／6：產生 .tool-node.cmd（機器特定內容，已由專案 .gitignore 排除）──
echo.
echo [步驟 3／6] 產生 .tool-node.cmd
> "%TOOLS_DIR%.tool-node.cmd" echo set "TOOL_NODE=%NODE_EXE%"
if defined BROWSERS_PATH >> "%TOOLS_DIR%.tool-node.cmd" echo set "PLAYWRIGHT_BROWSERS_PATH=%BROWSERS_PATH%"
echo   已寫入：%TOOLS_DIR%.tool-node.cmd
if defined BROWSERS_PATH echo   （含 PLAYWRIGHT_BROWSERS_PATH——所有工具執行期都會到此位置找瀏覽器）

rem ── 步驟 4／6：npm install（以工具用 Node 直接執行 npm-cli.js，不依賴 PATH 上的 npm）──
echo.
echo [步驟 4／6] 安裝工具依賴（playwright、pixelmatch、pngjs）
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

rem ── 步驟 5／6：下載 Playwright Chromium（以 tools 內已安裝的 playwright cli 執行；位置依步驟②）──
echo.
if defined BROWSERS_PATH (
  echo [步驟 5／6] 下載 Playwright Chromium 到專案內 %BROWSERS_PATH%（一次性，約 150MB）
  set "PLAYWRIGHT_BROWSERS_PATH=%BROWSERS_PATH%"
) else (
  echo [步驟 5／6] 下載 Playwright Chromium 到使用者快取（一次性，約 150MB）
)
if defined BROWSERS_PATH goto install_browsers_project
"%NODE_EXE%" "%TOOLS_DIR%node_modules\playwright\cli.js" install chromium
goto install_browsers_done
:install_browsers_project
set "PLAYWRIGHT_BROWSERS_PATH=%BROWSERS_PATH%"
"%NODE_EXE%" "%TOOLS_DIR%node_modules\playwright\cli.js" install chromium
:install_browsers_done
if errorlevel 1 (
  echo 錯誤：playwright install chromium 失敗（網路或磁碟問題）。 1>&2
  exit /b 1
)
echo   Chromium 下載完成。

rem ── 步驟 6／6：自我驗證提示（安裝指南.md 第 9 項：shot 一次＋diff 一次確認工具鏈通）──
echo.
echo [步驟 6／6] 安裝完成。請執行以下自我驗證：
echo   1. shot.cmd --help 與 diff.cmd --help 可正常顯示用法（不需瀏覽器與依賴）。
echo   2. 以測試頁截圖一次（shot）＋兩張圖比對一次（diff），確認 Playwright Chromium 可啟動。
echo   3. 確認 .tool-node.cmd 已被專案 .gitignore 排除（機器特定內容，不進版控）。
if defined BROWSERS_PATH echo   4. 確認 %BROWSERS_PATH% 同樣被 .gitignore 排除（瀏覽器二進位不進版控）。
echo   5. 日後工具用 Node 路徑失效時，重新執行本 setup.cmd 即可（瀏覽器位置可再次選擇）。
exit /b 0
