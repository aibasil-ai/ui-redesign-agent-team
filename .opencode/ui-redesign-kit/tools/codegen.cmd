@echo off
chcp 65001 >nul
rem codegen.cmd — UI 重構工具包：Playwright codegen 錄製包裝（可選輔助，非標準流程）
rem 用法：cmd /c .opencode\ui-redesign-kit\tools\codegen.cmd --url-file <URL 參數檔路徑>
rem   URL 參數檔為單一 JSON：{"url":"https://...","storageState":"可選 storageState 檔案路徑"}
rem   （A2 決策：CLI 不直接接收含 & ; | 的字串；網址一律經參數檔傳入。）
rem 行為：以工具用 Node 啟動 playwright 的 codegen（headful 互動視窗）供使用者手動操作，
rem   操作過程產生腳本程式碼；結束碼＝codegen 結束碼（0=成功）。
rem   參數檔內 storageState 欄位有值時以 --load-storage 帶入（與 shot 的 storageState 同格式）。
rem 說明：codegen 直接以 inline node -e 讀取參數檔，不需 ui-profile，但依賴 .tool-node.cmd
rem   與已安裝的 playwright（請先執行 setup.cmd）。
if not exist "%~dp0.tool-node.cmd" (
  echo 錯誤：找不到 .tool-node.cmd（工具用 Node 設定檔），請先執行 setup.cmd。 1>&2
  exit /b 3
)
call "%~dp0.tool-node.cmd"
if not defined TOOL_NODE (
  echo 錯誤：.tool-node.cmd 未定義 TOOL_NODE，請重新執行 setup.cmd。 1>&2
  exit /b 3
)
"%TOOL_NODE%" -e "const fs=require('fs'),path=require('path'),cp=require('child_process');const a=process.argv;const toolsDir=a[1];const args=a.slice(2);if(args.length!==2||args[0]!=='--url-file'){console.error('用法：codegen.cmd --url-file <URL 參數檔路徑>');process.exit(2);}const raw=args[1];if(raw.split(/[\\\/]/).includes('..')){console.error('錯誤：--url-file 路徑不可含 .. 跳脫');process.exit(2);}const p=path.resolve(raw);let j=null;try{j=JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){console.error('錯誤：--url-file 讀取或 JSON 解析失敗：'+p);process.exit(2);}if(!j||typeof j!=='object'||typeof j.url!=='string'||!(/^(https?|file):\/\//i).test(j.url)){console.error('錯誤：參數檔需含 url 欄位（http、https 或 file 網址）');process.exit(2);}const cli=path.join(toolsDir,'node_modules','playwright','cli.js');if(!fs.existsSync(cli)){console.error('錯誤：找不到 playwright（'+cli+'），請先執行 setup.cmd');process.exit(3);}const cliArgs=['codegen'];if(typeof j.storageState==='string'&&j.storageState.trim()!==''){const sp=path.resolve(j.storageState);if(!fs.existsSync(sp)){console.error('錯誤：storageState 檔案不存在：'+sp);process.exit(2);}cliArgs.push('--load-storage='+sp);}cliArgs.push(j.url);const r=cp.spawnSync(process.execPath,cliArgs,{stdio:'inherit'});process.exit(r.status===null?1:r.status);" "%~dp0" %*
exit /b %ERRORLEVEL%
