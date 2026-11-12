/**
 * diff.mjs — UI 重構工具包：兩圖比對（pngjs 讀寫 ＋ pixelmatch 比對 ＋ 內建寬度對齊）
 *
 * CLI 契約（設計書 §6.2）：
 *   diff.cmd --design <設計圖 PNG> --actual <實際截圖 PNG> [--align width|exact]
 *            [--threshold <0～1>] --out <JSON 路徑>
 *
 * 輸出（以 --out 的基名衍生，三個檔案同目錄）：
 *   <基名>.json          差異像素百分比報告（含對齊後尺寸資訊）
 *   <基名>-overlay.png   疊圖（設計圖與對齊後實際截圖 50%／50% 混合）
 *   <基名>-diff.png      差異標色圖（pixelmatch 輸出）
 *   建議 --out 命名為 <viewport>.json（例如 1440x900.json），將自動產出
 *   1440x900-overlay.png 與 1440x900-diff.png，與 §9 的產物命名慣例一致。
 *
 * 對齊（--align width，預設）：以「設計圖寬度」為基準縮放實際截圖（雙線性插值）；
 *   高度不足時底部補白（白色）、過長時底部裁切，並於 JSON 標註 paddedBottom／croppedBottom。
 *   --align exact：兩圖尺寸必須完全相同，否則拒絕比對。
 *
 * 輸入契約：--design、--actual 為唯讀輸入（僅讀取，不寫入）；一律拒絕「..」。
 * 輸出契約：--out 限 <產物根目錄>/<slug>/.artifacts/ 子樹（接受 .worktrees/ 前綴）。
 * 僅支援 PNG（pixelmatch＋pngjs 生態；JPEG 請先轉檔）。
 *
 * 結束碼：0=成功；2=用法／參數錯誤；3=環境或依賴問題；其他非 0=執行失敗。錯誤一律輸出 stderr。
 * --help 不需要依賴即可執行（pixelmatch／pngjs 以動態 import 延後載入）。
 */
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {
  die,
  ensureParentDir,
  validateInputPath,
  validateOutputPath,
  assertPngSignature,
} from './lib/paths.mjs';

const USAGE = `用法（設計書 §6.2，經 diff.cmd 呼叫）：

  diff.cmd --design <設計圖 PNG> --actual <實際截圖 PNG> [--align width|exact]
           [--threshold <0～1>] --out <JSON 路徑>

參數說明：
  --design      必填。設計素材 PNG（唯讀輸入；相對路徑以目前工作目錄解析）。
  --actual      必填。實際截圖 PNG（唯讀輸入；相對路徑以目前工作目錄解析）。
  --align       對齊方式：width（預設）＝以設計圖寬為基準縮放實際截圖，
                高度不足補白／過長裁切（JSON 標註）；exact＝兩圖尺寸必須完全相同。
  --threshold   pixelmatch 的顏色差異門檻（0～1，預設 0.1；越小越敏感）。
  --out         必填。差異報告 JSON 路徑（必須以 .json 結尾），並於同目錄產生
                <基名>-overlay.png（疊圖）與 <基名>-diff.png（差異標色圖）。
                依輸出契約：必須位於 <產物根目錄>/<slug>/.artifacts/ 子樹
                （或 .worktrees/<名稱>/<產物根目錄>/<slug>/.artifacts/）；
                相對路徑以目前工作目錄解析。父目錄不存在時會自動建立。

範例：
  cmd /c .opencode\\ui-redesign-kit\\tools\\diff.cmd --design docs\\ui-redesign\\login\\.artifacts\\design-1440.png --actual docs\\ui-redesign\\login\\.artifacts\\r1\\1440x900-actual.png --out docs\\ui-redesign\\login\\.artifacts\\r1\\1440x900.json

結束碼：0=成功；2=用法錯誤；3=環境或依賴問題；其他非 0=執行失敗`;

/** parseArgs 的選項定義（--help 在此之前已攔截） */
const DIFF_OPTIONS = {
  design: { type: 'string' },
  actual: { type: 'string' },
  align: { type: 'string' },
  threshold: { type: 'string' },
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
    parsed = parseArgs({ args: argv, options: DIFF_OPTIONS, strict: true });
  } catch (err) {
    die(2, `錯誤：參數用法不正確（${err.message}）。\n\n${USAGE}`);
  }
  return parsed.values;
}

/** 動態載入 pixelmatch 與 pngjs（依賴未安裝 → 結束碼 3，提示先執行 setup.cmd） */
async function loadDependencies() {
  try {
    const [pixelmatchModule, pngjsModule] = await Promise.all([import('pixelmatch'), import('pngjs')]);
    // pixelmatch 為 ESM default export；pngjs 為 CJS（以 default 匯入後解構，兩種形式都相容）
    const pixelmatch = pixelmatchModule.default ?? pixelmatchModule;
    const PNG = (pngjsModule.default && pngjsModule.default.PNG) || pngjsModule.PNG;
    if (typeof pixelmatch !== 'function' || typeof PNG !== 'function') {
      throw new Error('依賴套件的匯出形式不如預期');
    }
    return { pixelmatch, PNG };
  } catch (err) {
    die(3, `錯誤：無法載入 pixelmatch／pngjs（${err.message}）。請先在 tools/ 目錄執行 setup.cmd 安裝依賴。`);
  }
}

/** 讀取 PNG 並回傳 PNG 物件（含 width、height、data） */
function readPngImage(PNG, absolutePath, label) {
  let image;
  try {
    image = PNG.sync.read(fs.readFileSync(absolutePath));
  } catch (err) {
    die(2, `錯誤：${label}讀取或 PNG 解析失敗：${absolutePath}（${err.message}）`);
  }
  return image;
}

/**
 * 雙線性縮放 RGBA 影像資料（實際截圖 → 設計圖寬度基準）。
 * 以像素中心對齊（(目標座標 + 0.5) * 縮放比 - 0.5），邊界 clamp。
 */
function resizeBilinearRgba(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const target = new Uint8Array(targetWidth * targetHeight * 4);
  const xRatio = sourceWidth / targetWidth;
  const yRatio = sourceHeight / targetHeight;
  for (let targetY = 0; targetY < targetHeight; targetY++) {
    const sourceYf = (targetY + 0.5) * yRatio - 0.5;
    const y0 = Math.min(Math.max(Math.floor(sourceYf), 0), sourceHeight - 1);
    const y1 = Math.min(y0 + 1, sourceHeight - 1);
    const fy = Math.min(Math.max(sourceYf - Math.floor(sourceYf), 0), 1);
    for (let targetX = 0; targetX < targetWidth; targetX++) {
      const sourceXf = (targetX + 0.5) * xRatio - 0.5;
      const x0 = Math.min(Math.max(Math.floor(sourceXf), 0), sourceWidth - 1);
      const x1 = Math.min(x0 + 1, sourceWidth - 1);
      const fx = Math.min(Math.max(sourceXf - Math.floor(sourceXf), 0), 1);
      const targetOffset = (targetY * targetWidth + targetX) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const p00 = source[(y0 * sourceWidth + x0) * 4 + channel];
        const p10 = source[(y0 * sourceWidth + x1) * 4 + channel];
        const p01 = source[(y1 * sourceWidth + x0) * 4 + channel];
        const p11 = source[(y1 * sourceWidth + x1) * 4 + channel];
        const top = p00 + (p10 - p00) * fx;
        const bottom = p01 + (p11 - p01) * fx;
        target[targetOffset + channel] = Math.round(top + (bottom - top) * fy);
      }
    }
  }
  return target;
}

/** 高度不足時底部補白（白色不透明，符合網頁設計圖常見白底；JSON 標註 paddedBottom） */
function padBottomRgba(source, width, sourceHeight, targetHeight) {
  const target = new Uint8Array(width * targetHeight * 4);
  target.fill(255);
  target.set(source.subarray(0, width * sourceHeight * 4), 0);
  return target;
}

/** 高度過長時底部裁切（JSON 標註 croppedBottom） */
function cropBottomRgba(source, width, targetHeight) {
  return source.slice(0, width * targetHeight * 4);
}

/** 疊圖：設計圖與對齊後實際截圖的 50%／50% 混合（各 channel 取平均） */
function blendHalfRgba(imageA, imageB) {
  const blended = new Uint8Array(imageA.length);
  for (let i = 0; i < imageA.length; i++) {
    blended[i] = (imageA[i] + imageB[i]) >> 1;
  }
  return blended;
}

/** 解析 --align（預設 width；僅接受 width｜exact） */
function parseAlign(raw) {
  if (raw === undefined) return 'width';
  if (raw === 'width' || raw === 'exact') return raw;
  die(2, `錯誤：--align 僅接受 width 或 exact（收到：${raw}）`);
}

/** 解析 --threshold（0～1 的數字；預設 0.1＝pixelmatch 預設） */
function parseThreshold(raw) {
  if (raw === undefined) return 0.1;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    die(2, `錯誤：--threshold 應為 0～1 的數字（預設 0.1）：${raw}`);
  }
  return value;
}

/**
 * 依對齊模式計算比對用影像資料。
 * 回傳：{ alignedData, alignedWidth, alignedHeight, resizedActual, paddedBottom, croppedBottom }
 */
function alignActualImage(actualData, actualSize, designSize, alignMode) {
  if (alignMode === 'exact') {
    if (actualSize.width !== designSize.width || actualSize.height !== designSize.height) {
      die(2, `錯誤：--align exact 要求兩圖尺寸完全相同。\n  設計圖：${designSize.width}x${designSize.height}\n  實際截圖：${actualSize.width}x${actualSize.height}\n  請改用 --align width（內建對齊）或先調整截圖視窗。`);
    }
    return {
      alignedData: actualData, alignedWidth: designSize.width, alignedHeight: designSize.height,
      resizedActual: false, paddedBottom: 0, croppedBottom: 0,
    };
  }

  // --align width：以設計圖寬為基準
  let scaled = actualData;
  let scaledHeight = actualSize.height;
  let resizedActual = false;
  if (actualSize.width !== designSize.width) {
    scaledHeight = Math.round(actualSize.height * (designSize.width / actualSize.width));
    scaled = resizeBilinearRgba(actualData, actualSize.width, actualSize.height, designSize.width, Math.max(scaledHeight, 1));
    resizedActual = true;
  }
  let paddedBottom = 0;
  let croppedBottom = 0;
  let alignedData = scaled;
  if (scaledHeight < designSize.height) {
    paddedBottom = designSize.height - scaledHeight;
    alignedData = padBottomRgba(scaled, designSize.width, scaledHeight, designSize.height);
  } else if (scaledHeight > designSize.height) {
    croppedBottom = scaledHeight - designSize.height;
    alignedData = cropBottomRgba(scaled, designSize.width, designSize.height);
  }
  return {
    alignedData, alignedWidth: designSize.width, alignedHeight: designSize.height,
    resizedActual, paddedBottom, croppedBottom,
  };
}

/** 主流程：解析參數 → 驗證路徑契約 → 讀圖對齊 → pixelmatch → 疊圖與輸出 */
async function main() {
  const values = parseArguments();

  for (const required of ['design', 'actual', 'out']) {
    if (values[required] === undefined || String(values[required]).trim() === '') {
      die(2, `錯誤：缺少 --${required}。\n\n${USAGE}`);
    }
  }

  // 輸入契約：唯讀輸入、必須存在、拒絕「..」；diff 僅支援 PNG
  const designPath = validateInputPath(values.design, '--design 設計圖路徑');
  const actualPath = validateInputPath(values.actual, '--actual 實際截圖路徑');
  assertPngSignature(designPath, '--design 設計圖');
  assertPngSignature(actualPath, '--actual 實際截圖');
  const alignMode = parseAlign(values.align);
  const threshold = parseThreshold(values.threshold);

  // 輸出契約：--out 限 <產物根目錄>/<slug>/.artifacts/ 子樹（接受 .worktrees/ 前綴）
  const outJsonPath = validateOutputPath(values.out, 'artifacts', '--out 輸出路徑');
  if (path.extname(outJsonPath).toLowerCase() !== '.json') {
    die(2, `錯誤：--out 必須是 .json 檔（收到：${path.basename(outJsonPath)}）。`);
  }
  // 同目錄衍生輸出（--out 驗證通過後，同目錄的衍生檔必然仍在允許子樹內）
  const baseName = outJsonPath.replace(/\.json$/i, '');
  const overlayPath = `${baseName}-overlay.png`;
  const diffImagePath = `${baseName}-diff.png`;

  const { pixelmatch, PNG } = await loadDependencies();

  // 讀取兩圖（唯讀）
  const designImage = readPngImage(PNG, designPath, '--design 設計圖');
  const actualImage = readPngImage(PNG, actualPath, '--actual 實際截圖');
  const designSize = { width: designImage.width, height: designImage.height };
  const actualSize = { width: actualImage.width, height: actualImage.height };

  // 對齊（width＝以設計圖寬為基準；exact＝尺寸必須一致）
  const aligned = alignActualImage(actualImage.data, actualSize, designSize, alignMode);

  // pixelmatch 比對（輸出 diff 標色影像）
  const diffImage = new PNG({ width: designSize.width, height: designSize.height });
  let diffPixels = 0;
  try {
    diffPixels = pixelmatch(designImage.data, aligned.alignedData, diffImage.data, designSize.width, designSize.height, { threshold });
  } catch (err) {
    die(1, `錯誤：pixelmatch 比對失敗：${err.message}`);
  }
  const totalPixels = designSize.width * designSize.height;
  const diffPercent = Number(((diffPixels / totalPixels) * 100).toFixed(4));

  // 疊圖（50%／50% 混合）
  const overlayImage = new PNG({ width: designSize.width, height: designSize.height });
  overlayImage.data.set(blendHalfRgba(designImage.data, aligned.alignedData));

  // 寫出三個輸出檔（疊圖、diff 圖、報告 JSON）
  ensureParentDir(outJsonPath);
  fs.writeFileSync(overlayPath, PNG.sync.write(overlayImage));
  fs.writeFileSync(diffImagePath, PNG.sync.write(diffImage));
  const report = {
    tool: 'diff',
    designImage: designPath,
    actualImage: actualPath,
    align: alignMode,
    threshold,
    designSize,
    actualSize,
    alignedSize: { width: aligned.alignedWidth, height: aligned.alignedHeight },
    resizedActual: aligned.resizedActual,
    paddedBottom: aligned.paddedBottom,
    croppedBottom: aligned.croppedBottom,
    diffPixels,
    totalPixels,
    diffPercent,
    overlayPath,
    diffPath: diffImagePath,
  };
  fs.writeFileSync(outJsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  // stdout 摘要（供 agent 直接判讀；判定仍以 overlay／diff 圖人工或模型看圖為準）
  console.log(`比對完成：差異像素 ${diffPixels}／${totalPixels}（${diffPercent}%）`);
  console.log(`  設計圖：${designSize.width}x${designSize.height}；實際截圖：${actualSize.width}x${actualSize.height}；對齊後：${aligned.alignedWidth}x${aligned.alignedHeight}（align=${alignMode}，threshold=${threshold}）`);
  if (aligned.resizedActual) console.log('  對齊：實際截圖已縮放至設計圖寬度。');
  if (aligned.paddedBottom > 0) console.log(`  對齊：實際截圖高度不足，底部補白 ${aligned.paddedBottom}px（JSON 已標註）。`);
  if (aligned.croppedBottom > 0) console.log(`  對齊：實際截圖過長，底部裁切 ${aligned.croppedBottom}px（JSON 已標註）。`);
  console.log(`  overlay：${overlayPath}`);
  console.log(`  diff 圖：${diffImagePath}`);
  console.log(`  報告 JSON：${outJsonPath}`);
}

main().catch((err) => {
  console.error(`錯誤：${err && err.message ? err.message : String(err)}`);
  process.exit(1);
});
