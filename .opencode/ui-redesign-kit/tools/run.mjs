/**
 * run.mjs — UI 重構工具包：執行 <產物根目錄>/<slug>/scripts/ 子樹內的客製 Playwright 腳本
 *
 * CLI 契約（設計書 §6.2）：
 *   run.cmd <腳本.mjs> [參數…]
 *   - 腳本路徑依「輸出契約」驗證：realpath 後僅限 <專案根>\<產物根目錄>\<slug>\scripts\… 子樹，
 *     或 <專案根>\.worktrees\<任何名稱>\<產物根目錄>\<slug>\scripts\…（worktree 情境）；
 *     拒絕「..」與符號連結脫離（詳見 lib/paths.mjs 的 validateOutputPath）。
 *   - 僅接受 .mjs（ESM）腳本。
 *   - 以「工具用 Node」子程序執行（環境變數 TOOL_NODE，由 run.cmd 經 .tool-node.cmd 帶入）；
 *     stdout／stderr 串流透傳、結束碼透傳（0=腳本成功；非 0=腳本或環境失敗）。
 *
 * 依賴解析：腳本以 `import { chromium } from 'playwright'` 撰寫即可——本工具會在腳本所在
 * 目錄暫時建立 node_modules junction 指向 tools/node_modules（ESM 的向上解析即可找到依賴），
 * 執行結束後拆除僅由本工具建立的連結（rmdir 只拆 junction 本身，不動目標內容）。
 *
 * 已知邊界（§6.2、§15.6）：客製腳本以工具用 Node 執行＝具備完整 Node 能力（可寫檔）。
 * 防護三層：①本工具的路徑驗證（僅 scripts/ 子樹）②functional-qa 正文規定「首次執行任一
 * 腳本前，於回覆中列出路徑與用途」③安裝指南向使用者說明。
 *
 * 子程序環境變數（自行決策，供腳本取用）：
 *   UI_REDESIGN_PROJECT_ROOT（專案根）、UI_REDESIGN_TOOLS_DIR、UI_REDESIGN_KIT_DIR、
 *   UI_REDESIGN_SCRIPT_WORKDIR（腳本執行工作目錄：worktree 根或專案根）。
 *
 * 結束碼：0=成功；2=用法錯誤；3=環境問題；其他＝腳本結束碼透傳。錯誤一律輸出 stderr。
 * --help 不需要依賴即可執行。
 */
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {
  die,
  warn,
  resolveKitPaths,
  validateOutputPath,
  getScriptWorkdir,
} from './lib/paths.mjs';

const USAGE = `用法（設計書 §6.2，經 run.cmd 呼叫）：

  run.cmd <腳本.mjs> [參數…]

說明：
  <腳本.mjs>   必填。functional-qa 撰寫的客製 Playwright 腳本（僅接受 .mjs／ESM）。
               路徑依輸出契約驗證：僅限 <產物根目錄>/<slug>/scripts/ 子樹，
               或 .worktrees/<名稱>/<產物根目錄>/<slug>/scripts/（worktree 情境）；
               相對路徑以目前工作目錄解析；拒絕「..」與符號連結脫離。
  [參數…]     其餘參數原樣透傳給腳本（process.argv[2..]）。

執行環境：
  - 以「工具用 Node」執行（環境變數 TOOL_NODE，由 run.cmd 經 .tool-node.cmd 帶入）；
    直接以 node 執行本檔時會拒絕（請一律經 run.cmd）。
  - 腳本可 import 'playwright'（本工具會暫時在腳本目錄建立 node_modules junction，
    執行結束後拆除）。
  - 腳本的工作目錄：位於 worktree 時為該 worktree 根，否則為專案根
    （環境變數 UI_REDESIGN_SCRIPT_WORKDIR 可取得絕對路徑）。
  - stdout／stderr 直接串流；本工具的結束碼＝腳本的結束碼。

安全契約（§6.2、§15.6）：
  首次執行任一腳本前，functional-qa 應於回覆中列出路徑與用途；本工具僅放行
  scripts/ 子樹內的腳本。

範例：
  cmd /c .opencode\\ui-redesign-kit\\tools\\run.cmd docs\\ui-redesign\\login\\scripts\\regression-login.mjs

結束碼：0=成功；2=用法錯誤；3=環境問題；其他＝腳本結束碼透傳`;

/** 顯示用法（stdout）並以 0 結束 */
function printUsageAndExit() {
  console.log(USAGE);
  process.exit(0);
}

/**
 * 暫時確保腳本所在目錄有 node_modules junction 指向 tools/node_modules，
 * 讓腳本 `import 'playwright'` 可解析（ESM 向上查找 node_modules）。
 * 回傳：{ linkPath, created }；執行結束後由 removeNodeModulesLink 拆除（僅限本函式建立者）。
 */
function ensureNodeModulesLink(scriptsDir, toolsNodeModules) {
  if (!fs.existsSync(toolsNodeModules)) {
    die(3, `錯誤：工具依賴未安裝（找不到 ${toolsNodeModules}）。請先在 tools/ 目錄執行 setup.cmd。`);
  }
  const linkPath = path.join(scriptsDir, 'node_modules');
  try {
    const stats = fs.lstatSync(linkPath);
    // 已存在的連結：必須指向 tools/node_modules 才沿用；其他情況一律停止（避免誤動不明目錄）
    if (!stats.isSymbolicLink()) {
      die(3, `錯誤：${linkPath} 已存在且不是連結。為避免誤刪，請人工確認後自行處理。`);
    }
    const realTarget = fs.realpathSync(linkPath);
    if (path.resolve(realTarget) !== path.resolve(toolsNodeModules)) {
      die(3, `錯誤：${linkPath} 已存在但指向其他位置（${realTarget}）。為避免誤動，請人工確認。`);
    }
    return { linkPath, created: false };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      die(3, `錯誤：無法確認 ${linkPath} 的狀態：${err.message}`);
    }
  }
  try {
    // junction 不需管理員權限；目標為絕對路徑
    fs.symlinkSync(toolsNodeModules, linkPath, 'junction');
  } catch (err) {
    die(3, `錯誤：無法建立 node_modules 連結（${linkPath} → ${toolsNodeModules}）：${err.message}`);
  }
  return { linkPath, created: true };
}

/** 拆除僅由本工具建立的 node_modules junction（rmdir 對 junction 只拆連結、不動目標內容） */
function removeNodeModulesLink(link) {
  if (!link || !link.created) return;
  try {
    fs.rmdirSync(link.linkPath);
  } catch (err) {
    warn(`警告：node_modules 連結拆除失敗（請手動檢查，不影響腳本結果）：${link.linkPath}（${err.message}）`);
  }
}

/** 主流程：解析參數 → 驗證腳本路徑契約 → junction → spawn 工具用 Node → 透傳結束碼 */
async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.includes('--help') || arguments_.includes('-h')) printUsageAndExit();

  const scriptArg = arguments_[0];
  if (scriptArg === undefined || scriptArg.trim() === '') {
    die(2, `錯誤：缺少腳本路徑。\n\n${USAGE}`);
  }

  // 環境檢查：必須經 run.cmd 執行（TOOL_NODE 由 .tool-node.cmd 帶入）
  const toolNode = process.env.TOOL_NODE;
  if (!toolNode) {
    die(3, `錯誤：環境變數 TOOL_NODE 未定義。請經 run.cmd 執行（先確認 tools/.tool-node.cmd 存在，必要時執行 setup.cmd）。`);
  }
  if (!fs.existsSync(toolNode)) {
    die(3, `錯誤：工具用 Node 不存在（TOOL_NODE=${toolNode}）。請依安裝指南重新執行 setup.cmd。`);
  }

  // 輸出契約：腳本僅限 <產物根目錄>/<slug>/scripts/ 子樹（接受 .worktrees/ 前綴）
  const scriptPath = validateOutputPath(scriptArg, 'scripts', '腳本路徑');
  if (!/\.mjs$/i.test(scriptPath)) {
    die(2, `錯誤：run 僅接受 .mjs（ESM）腳本（收到：${path.basename(scriptPath)}）。`);
  }
  if (!fs.existsSync(scriptPath)) {
    die(2, `錯誤：腳本不存在：${scriptPath}`);
  }

  const kitPaths = resolveKitPaths();
  const scriptsDir = path.dirname(scriptPath);
  const workdir = getScriptWorkdir(scriptPath);

  // 暫時建立 node_modules junction（執行結束後於 finally 拆除僅由本工具建立的）
  const link = ensureNodeModulesLink(scriptsDir, path.join(kitPaths.toolsDir, 'node_modules'));
  try {
    const childEnvironment = {
      ...process.env,
      UI_REDESIGN_PROJECT_ROOT: kitPaths.projectRoot,
      UI_REDESIGN_TOOLS_DIR: kitPaths.toolsDir,
      UI_REDESIGN_KIT_DIR: kitPaths.kitDir,
      UI_REDESIGN_SCRIPT_WORKDIR: workdir,
    };
    const child = cp.spawn(toolNode, [scriptPath, ...arguments_.slice(1)], {
      stdio: 'inherit', // stdout／stderr 直接串流
      cwd: workdir,
      env: childEnvironment,
    });
    const exitCode = await new Promise((resolve) => {
      child.on('error', (err) => {
        die(3, `錯誤：無法啟動工具用 Node（${toolNode}）：${err.message}`);
      });
      child.on('exit', (code) => resolve(code));
    });
    process.exit(exitCode === null ? 1 : exitCode); // 結束碼透傳
  } finally {
    removeNodeModulesLink(link);
  }
}

main().catch((err) => {
  console.error(`錯誤：${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
