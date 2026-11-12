/**
 * shot.mjs — UI 重構工具包：頁面截圖與頁內量測（Playwright 自帶 Chromium，headless）
 *
 * CLI 契約（設計書 §6.2）：
 *   截圖模式：shot.cmd --url-file <URL 參數檔> --viewport <寬x高> [--wait networkidle|<CSS 選擇器>]
 *                      [--full-page] [--scale <deviceScaleFactor>] --out <PNG 路徑>
 *   量測模式：shot.cmd --url-file <URL 參數檔> --measure <CSS 選擇器|all> [--viewport <寬x高>]
 *                      [--wait networkidle|<CSS 選擇器>] [--scale <n>] --out <JSON 路徑>
 *
 * 行為重點：
 *   - URL 一律經 --url-file 參數檔傳入（A2 決策，§6.1）：
 *     {"url":"https://…","storageState":"可選檔案路徑"}；CLI 不接收含 &、;、| 的字串。
 *   - 需登入態的頁面：storageState 檔（使用者提供、gitignored）於 newContext 時帶入；
 *     Playwright Chromium 與使用者日常環境完全隔離（§6.1）。
 *   - --out 依輸出契約驗證（限 <產物根目錄>/<slug>/.artifacts/ 子樹，接受 .worktrees/ 前綴）；
 *     其餘路徑一律唯讀（輸入契約）。
 *   - 量測輸出：getBoundingClientRect ＋ getComputedStyle（座標、寬高、間距、字級、顏色等）。
 *
 * 結束碼：0=成功；2=用法／參數錯誤；3=環境或依賴問題；其他非 0=執行失敗。錯誤一律輸出 stderr。
 * --help 不需要瀏覽器與依賴即可執行（playwright 以動態 import 延後載入）。
 */
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {
  die,
  warn,
  ensureParentDir,
  readUrlFile,
  validateOutputPath,
  describeUrlForLog,
} from './lib/paths.mjs';

/** 量測模式的元素數上限（--measure all 時避免整頁元素過多造成輸出爆炸） */
const MEASURE_LIMIT = 500;
/** 頁面載入與等待條件的逾時（毫秒） */
const PAGE_TIMEOUT_MS = 30000;
/** 字型載入等待的保護上限（毫秒）：逾時不擋流程，僅避免久等 */
const FONTS_READY_TIMEOUT_MS = 5000;

const USAGE = `用法（設計書 §6.2，經 shot.cmd 呼叫）：

  截圖模式：
    shot.cmd --url-file <URL 參數檔> --viewport <寬x高> [--wait networkidle|<CSS 選擇器>]
             [--full-page] [--scale <deviceScaleFactor>] --out <PNG 路徑>

  量測模式：
    shot.cmd --url-file <URL 參數檔> --measure <CSS 選擇器|all> [--viewport <寬x高>]
             [--wait networkidle|<CSS 選擇器>] [--scale <n>] --out <JSON 路徑>

參數說明：
  --url-file    必填。URL 參數檔（單一 JSON）：
                  {"url":"https://…","storageState":"可選 storageState 檔案路徑"}
                網址含 &、;、| 等字元時一律寫入此檔再呼叫（A2 決策：CLI 不直接接收字串）。
                相對路徑以目前工作目錄解析。
  --viewport    視窗大小，格式 <寬>x<高>（例如 1440x900）。未指定時使用 1280x720 並提示。
  --wait        等待條件：networkidle（預設）或 CSS 選擇器（等待該元素可見）。
                逾時 30 秒；SPA 有輪詢導致 networkidle 逾時時，請改用選擇器。
  --full-page   截圖模式專用：整頁截圖（含捲動區域）。
  --scale       截圖模式專用：deviceScaleFactor（例如 2 表示 2x）。預設 1。
  --measure     量測模式：CSS 選擇器範圍；或 all＝頁面全部可見元素（上限 ${MEASURE_LIMIT} 個）。
                同時指定 --full-page 時會被忽略（量測不截圖）。
  --out         必填。截圖模式必須以 .png 結尾；量測模式必須以 .json 結尾。
                依輸出契約：必須位於 <產物根目錄>/<slug>/.artifacts/ 子樹
                （或 .worktrees/<名稱>/<產物根目錄>/<slug>/.artifacts/）；
                相對路徑以目前工作目錄解析。父目錄不存在時會自動建立。

範例：
  cmd /c .opencode\\ui-redesign-kit\\tools\\shot.cmd --url-file docs\\ui-redesign\\login\\.artifacts\\url-args.json --viewport 1440x900 --out docs\\ui-redesign\\login\\.artifacts\\r1\\1440x900-actual.png
  cmd /c .opencode\\ui-redesign-kit\\tools\\shot.cmd --url-file docs\\ui-redesign\\login\\.artifacts\\url-args.json --measure ".sidebar, .card" --out docs\\ui-redesign\\login\\.artifacts\\measure.json

結束碼：0=成功；2=用法錯誤；3=環境或依賴問題；其他非 0=執行失敗`;

/** parseArgs 的選項定義（--help 在此之前已攔截，不需依賴即可顯示用法） */
const SHOT_OPTIONS = {
  'url-file': { type: 'string' },
  viewport: { type: 'string' },
  wait: { type: 'string' },
  'full-page': { type: 'boolean', default: false },
  scale: { type: 'string' },
  measure: { type: 'string' },
  out: { type: 'string' },
};

/** 解析命令列參數；--help 最先處理（不載入任何第三方依賴） */
function parseArguments() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: SHOT_OPTIONS, strict: true });
  } catch (err) {
    die(2, `錯誤：參數用法不正確（${err.message}）。\n\n${USAGE}`);
  }
  return parsed.values;
}

/** 依模式檢查 --out 副檔名（截圖＝PNG；量測＝JSON） */
function checkOutExtension(outPath, mode) {
  const extension = path.extname(outPath).toLowerCase();
  if (mode === 'measure' && extension !== '.json') {
    die(2, `錯誤：量測模式的 --out 必須是 .json 檔（收到：${path.basename(outPath)}）。`);
  }
  if (mode === 'shot' && extension !== '.png') {
    die(2, `錯誤：截圖模式的 --out 必須是 .png 檔（收到：${path.basename(outPath)}）。`);
  }
}

/** 解析 --viewport（格式 <寬>x<高>；未指定時預設 1280x720 並提示） */
function parseViewport(raw) {
  if (raw === undefined) {
    warn('提示：未指定 --viewport，使用預設 1280x720。');
    return { width: 1280, height: 720 };
  }
  const match = /^(\d{1,5})[xX](\d{1,5})$/.exec(raw.trim());
  if (!match) {
    die(2, `錯誤：--viewport 格式錯誤（應為 <寬>x<高>，例如 1440x900）：${raw}`);
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 16 || width > 16384 || height < 16 || height > 16384) {
    die(2, `錯誤：--viewport 尺寸超出合理範圍（16～16384）：${raw}`);
  }
  return { width, height };
}

/** 解析 --scale（deviceScaleFactor，範圍 0.1～5；未指定時回傳 null＝Playwright 預設 1） */
function parseScale(raw) {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0.1 || value > 5) {
    die(2, `錯誤：--scale 應為 0.1～5 的數字（例如 2 表示 2x）：${raw}`);
  }
  return value;
}

/** 正規化 --wait：networkidle（預設）或 CSS 選擇器 */
function normalizeWait(raw) {
  if (raw === undefined || raw === 'networkidle') return { kind: 'networkidle', value: null };
  return { kind: 'selector', value: raw };
}

/**
 * 動態載入 playwright（--help 與參數驗證階段不需要瀏覽器依賴）。
 * 依賴未安裝 → 結束碼 3，提示先執行 setup.cmd。
 */
async function loadDependencies() {
  try {
    const playwright = await import('playwright');
    return { chromium: playwright.chromium };
  } catch (err) {
    die(3, `錯誤：無法載入 playwright（${err.code ?? err.message}）。請先在 tools/ 目錄執行 setup.cmd 安裝依賴。`);
  }
}

/** 建立瀏覽器 context（viewport、deviceScaleFactor、storageState） */
async function openBrowserContext(browser, { viewport, scaleFactor, urlInfo }) {
  const contextOptions = {
    viewport: { width: viewport.width, height: viewport.height },
  };
  if (scaleFactor !== null) contextOptions.deviceScaleFactor = scaleFactor;
  if (urlInfo.storageStatePath) contextOptions.storageState = urlInfo.storageStatePath;
  return browser.newContext(contextOptions);
}

/** 開啟頁面並套用等待條件；達成後等待網頁字型載入（保護上限 5 秒）以確保重現性 */
async function gotoAndWait(page, { urlInfo, wait }) {
  try {
    const gotoOptions = { timeout: PAGE_TIMEOUT_MS };
    if (wait.kind === 'networkidle') gotoOptions.waitUntil = 'networkidle';
    await page.goto(urlInfo.url, gotoOptions);
  } catch (err) {
    die(1, `錯誤：無法開啟頁面（${describeUrlForLog(urlInfo.url)}）：${String(err && err.message ? err.message : err).split('\n')[0]}`);
  }
  if (wait.kind === 'selector') {
    try {
      await page.waitForSelector(wait.value, { state: 'visible', timeout: PAGE_TIMEOUT_MS });
    } catch (err) {
      die(1, `錯誤：等待選擇器逾時（30 秒）或選擇器無效：「${wait.value}」（${String(err && err.message ? err.message : err).split('\n')[0]}）`);
    }
  }
  // 等待網頁字型載入完成，避免字體未就緒造成截圖／量測的重現性誤差；逾時不擋流程
  await page
    .evaluate(() => Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 5000))]))
    .catch(() => {});
}

/** 截圖模式主流程 */
async function runShotMode({ dependencies, urlInfo, outPath, viewport, scaleFactor, wait, fullPage }) {
  const browser = await dependencies.chromium.launch();
  try {
    const context = await openBrowserContext(browser, { viewport, scaleFactor, urlInfo });
    const page = await context.newPage();
    await gotoAndWait(page, { urlInfo, wait });
    ensureParentDir(outPath);
    await page.screenshot({ path: outPath, fullPage });
    return { outPath };
  } finally {
    await browser.close();
  }
}

/** 在頁面內執行的量測蒐集（由 page.evaluate 序列化執行；不得依賴外部閉包） */
const collectMeasurements = ({ selector, limit }) => {
  // 產生穩定的選擇器提示（供 design-analyzer 對照頁面元素；取到 body 為止，最多 6 段）
  const buildSelectorHint = (element) => {
    if (element.id) return '#' + element.id;
    const parts = [];
    let current = element;
    while (current && current !== document.body && parts.length < 6) {
      let segment = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(segment + '#' + current.id);
        break;
      }
      if (current.classList.length > 0) {
        segment += '.' + Array.from(current.classList).slice(0, 2).join('.');
      }
      const parent = current.parentElement;
      if (parent) {
        const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        if (sameTagSiblings.length > 1) segment += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
      parts.unshift(segment);
      current = current.parentElement;
    }
    return parts.length > 0 ? parts.join(' > ') : 'body';
  };

  const elements =
    selector === 'all'
      ? Array.from(document.body ? document.body.querySelectorAll('*') : [])
      : Array.from(document.querySelectorAll(selector));

  const items = [];
  let truncated = false;
  for (const element of elements) {
    if (items.length >= limit) {
      truncated = true;
      break;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const isVisible =
      rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    if (!isVisible) continue;
    items.push({
      hint: buildSelectorHint(element),
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList),
      text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) || null,
      // getBoundingClientRect：相對 viewport 左上角的 CSS 像素座標與尺寸
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
      },
      // 間距相關：margin／padding／gap／邊框寬度與圓角（皆為 getComputedStyle 值）
      spacing: {
        margin: { top: style.marginTop, right: style.marginRight, bottom: style.marginBottom, left: style.marginLeft },
        padding: { top: style.paddingTop, right: style.paddingRight, bottom: style.paddingBottom, left: style.paddingLeft },
        gap: { row: style.rowGap, column: style.columnGap },
        borderWidth: {
          top: style.borderTopWidth,
          right: style.borderRightWidth,
          bottom: style.borderBottomWidth,
          left: style.borderLeftWidth,
        },
        borderRadius: {
          topLeft: style.borderTopLeftRadius,
          topRight: style.borderTopRightRadius,
          bottomRight: style.borderBottomRightRadius,
          bottomLeft: style.borderBottomLeftRadius,
        },
      },
      // 字級與排版
      typography: {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textAlign: style.textAlign,
      },
      // 顏色
      color: {
        text: style.color,
        background: style.backgroundColor,
        opacity: style.opacity,
      },
      // 版面環境（供判讀布局機制）
      layout: {
        display: style.display,
        position: style.position,
        overflow: style.overflow,
        zIndex: style.zIndex,
        boxShadow: style.boxShadow,
      },
    });
  }
  return { truncated, items };
};

/** 量測模式主流程：回傳量測 JSON 物件（寫檔由呼叫端處理） */
async function runMeasureMode({ dependencies, urlInfo, outPath, viewport, scaleFactor, wait, selector }) {
  const browser = await dependencies.chromium.launch();
  try {
    const context = await openBrowserContext(browser, { viewport, scaleFactor, urlInfo });
    const page = await context.newPage();
    await gotoAndWait(page, { urlInfo, wait });
    let collected;
    try {
      collected = await page.evaluate(collectMeasurements, { selector, limit: MEASURE_LIMIT });
    } catch (err) {
      die(2, `錯誤：量測選擇器無效或頁內執行失敗：「${selector}」（${String(err && err.message ? err.message : err).split('\n')[0]}）`);
    }
    return {
      tool: 'shot（量測模式）',
      url: describeUrlForLog(urlInfo.url),
      storageState: urlInfo.storageStatePath,
      viewport,
      deviceScaleFactor: scaleFactor === null ? 1 : scaleFactor,
      wait: wait.kind === 'networkidle' ? 'networkidle' : `selector:${wait.value}`,
      selector,
      truncated: collected.truncated,
      elementCount: collected.items.length,
      elements: collected.items,
    };
  } finally {
    await browser.close();
  }
}

/** 主流程：解析參數 → 驗證路徑契約 → 依模式執行 */
async function main() {
  const values = parseArguments();

  // 模式判斷：有 --measure 即量測模式（同時指定 --full-page 時忽略並提示）
  const mode = values.measure ? 'measure' : 'shot';
  if (mode === 'measure' && values['full-page']) {
    warn('警告：量測模式忽略 --full-page（量測不截圖）。');
  }

  if (values['url-file'] === undefined) die(2, `錯誤：缺少 --url-file。\n\n${USAGE}`);
  if (values.out === undefined) die(2, `錯誤：缺少 --out。\n\n${USAGE}`);
  if (values.out.trim() === '') die(2, `錯誤：--out 不可為空。\n\n${USAGE}`);

  // 輸入契約：URL 參數檔唯讀；url 與 storageState 欄位在此驗證
  const urlInfo = readUrlFile(values['url-file']);
  // 輸出契約：--out 限 <產物根目錄>/<slug>/.artifacts/ 子樹（接受 .worktrees/ 前綴）
  const outPath = validateOutputPath(values.out, 'artifacts', '--out 輸出路徑');
  checkOutExtension(outPath, mode);

  const viewport = parseViewport(values.viewport);
  const scaleFactor = parseScale(values.scale);
  const wait = normalizeWait(values.wait);
  const dependencies = await loadDependencies();

  if (mode === 'measure') {
    const report = await runMeasureMode({
      dependencies, urlInfo, outPath, viewport, scaleFactor, wait, selector: values.measure,
    });
    ensureParentDir(outPath);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`量測完成：${outPath}`);
    console.log(`  元素數：${report.elementCount}${report.truncated ? '（已達上限，結果截斷）' : ''}`);
    console.log(`  選擇器：${values.measure}；視窗：${viewport.width}x${viewport.height}`);
    return;
  }

  await runShotMode({
    dependencies, urlInfo, outPath, viewport, scaleFactor, wait, fullPage: values['full-page'],
  });
  console.log(`截圖完成：${outPath}`);
  console.log(`  視窗：${viewport.width}x${viewport.height}（deviceScaleFactor ${scaleFactor === null ? 1 : scaleFactor}）${values['full-page'] ? '；整頁截圖' : ''}`);
  console.log(`  URL：${describeUrlForLog(urlInfo.url)}${urlInfo.storageStatePath ? '；已帶入 storageState' : ''}`);
}

main().catch((err) => {
  console.error(`錯誤：${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
