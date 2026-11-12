/**
 * lib/paths.mjs — UI 重構工具包共用模組（路徑契約核心，零第三方依賴）
 *
 * 職責（設計書 §6.2）：
 *   1. 主工作區根推導（唯一演算法）：以本檔（realpath 解析後）的所在目錄為起點，
 *      向上取三層父目錄：tools → ui-redesign-kit → .opencode → 專案根。
 *      kit 以 junction 掛進 worktree 時，realpath 會解析回主工作區真實路徑（§17.2）。
 *   2. 輸出路徑驗證：shot/diff 的 --out、run 的腳本路徑。realpath 解析後必須落在
 *      允許集合（逐一前綴比對，命中即放行；前綴比對以「區段邊界」為準，
 *      避免 docs/ui-redesign 誤匹配 docs/ui-redesign-something）：
 *        ① <專案根>\<產物根目錄>\<slug>\.artifacts\…  （shot/diff 輸出；run 限 scripts\…）
 *        ② <專案根>\.worktrees\<任何名稱>\<產物根目錄>\<slug>\…  （同上子樹限制）
 *      拒絕條件：含「..」跳脫、符號連結脫離該集合、realpath 後落在集合之外。
 *   3. 輸入路徑契約：--design、--actual、本地 HTML、--storage-state、--url-file 等
 *      「唯讀輸入」不套用產物集合（設計素材、storageState、URL 參數檔本來就在產物樹外）；
 *      契約為「工具對輸入路徑僅讀取，除 --out 外不寫入任何位置」（由各工具的寫入行為保證），
 *      並一律拒絕含「..」的路徑跳脫。
 *   4. ui-profile 的「產物根目錄」解析（設計書 §5.2「產物」欄位、§9 決策 D1）；
 *      解析不到時用預設值並向 stderr 警告。
 *   5. URL 參數檔讀取（A2 決策，§6.1）：{"url":"…","storageState":"可選路徑"}。
 *      CLI 不直接接收含 &、;、| 等 shell 串接風險字元的字串參數。
 *
 * 結束碼慣例（§6.2）：0=成功；2=用法／參數錯誤；3=環境或依賴問題；其他非 0=執行失敗。
 * 所有錯誤訊息一律輸出到 stderr。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 預設產物根目錄（ui-profile「產物」欄位解析不到時使用；§5.2、§9） */
export const DEFAULT_ARTIFACTS_ROOT = 'docs/ui-redesign';
/** 隔離區目錄名（§6.2 輸出契約的 worktree 前綴；§5.3 第 5 項：改目錄名時此契約需同步） */
export const WORKTREES_DIR_NAME = '.worktrees';
/** 輸出子樹目錄名：shot/diff 的 --out 限 .artifacts/ 子樹 */
export const ARTIFACTS_SUBDIR = '.artifacts';
/** 輸出子樹目錄名：run 的腳本路徑限 scripts/ 子樹 */
export const SCRIPTS_SUBDIR = 'scripts';

// ─────────────────────────────────────────────────────────────────────────────
// 主工作區根推導（唯一演算法，設計書 §6.2）
// ─────────────────────────────────────────────────────────────────────────────

/** 推導結果快取（同一程序內只算一次） */
let cachedKitPaths = null;

/**
 * 推導工具包各層路徑。先對本檔路徑做 fs.realpathSync（kit 為 junction 時
 * 解析回主工作區真實路徑），再向上三層取得專案根。
 * 回傳：{ thisFile, toolsDir, kitDir, opencodeDir, projectRoot }
 */
export function resolveKitPaths() {
  if (cachedKitPaths) return cachedKitPaths;
  // 先 realpath（§6.2 唯一演算法；§17.2：特別是 kit 為 junction 時）
  const thisFile = fs.realpathSync(fileURLToPath(import.meta.url)); // <tools>/lib/paths.mjs
  const toolsDir = path.dirname(path.dirname(thisFile));            // .../tools/
  const kitDir = path.dirname(toolsDir);                            // .../ui-redesign-kit/
  const opencodeDir = path.dirname(kitDir);                         // .../.opencode/
  const projectRoot = path.dirname(opencodeDir);                    // 專案根
  cachedKitPaths = { thisFile, toolsDir, kitDir, opencodeDir, projectRoot };
  return cachedKitPaths;
}

/** 取得專案根（主工作區根）絕對路徑 */
export function getProjectRoot() {
  return resolveKitPaths().projectRoot;
}

// ─────────────────────────────────────────────────────────────────────────────
// 訊息與結束輔助
// ─────────────────────────────────────────────────────────────────────────────

/** 警告訊息 → stderr（不中斷） */
export function warn(...messages) {
  process.stderr.write(messages.join(' ') + '\n');
}

/** 錯誤訊息 → stderr 並以指定結束碼結束程序 */
export function die(exitCode, ...messages) {
  for (const message of messages) process.stderr.write(message + '\n');
  process.exit(exitCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// 輸入路徑契約（唯讀輸入；拒 ..）
// ─────────────────────────────────────────────────────────────────────────────

/** 檢查原始路徑字串不得含「..」段（以 / 與 \ 兩種分隔符切段檢查） */
function assertNoDotDot(rawPath, label) {
  const segments = rawPath.split(/[\\/]/);
  if (segments.includes('..')) {
    die(2, `錯誤：${label}不可含「..」路徑跳脫：${rawPath}`);
  }
}

/**
 * 驗證「唯讀輸入路徑」：--design、--actual、本地 HTML、--storage-state、--url-file 等。
 * 契約（§6.2）：不套用產物集合檢查；工具僅讀取、不寫入（寫入行為由各工具保證）；拒絕「..」。
 * 相對路徑以「目前工作目錄」解析（agent 於專案根或 worktree 根呼叫工具）。
 * 參數 mustExist：true 時檢查檔案存在（大多數輸入檔必須已存在）。
 * 回傳：絕對路徑字串。
 */
export function validateInputPath(rawPath, label = '輸入路徑', { mustExist = true } = {}) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    die(2, `錯誤：${label}不可為空。`);
  }
  assertNoDotDot(rawPath, label);
  const absolutePath = path.resolve(rawPath);
  if (mustExist && !fs.existsSync(absolutePath)) {
    die(2, `錯誤：${label}不存在：${absolutePath}`);
  }
  return absolutePath;
}

// ─────────────────────────────────────────────────────────────────────────────
// ui-profile「產物根目錄」解析（§5.2 產物欄位；§9 決策 D1）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 讀取 ui-profile.md 的「產物根目錄」。
 * 檔案不存在或解析不到 → 回傳預設值 docs/ui-redesign，並向 stderr 警告。
 * 回傳：{ segments: string[], raw: string, source: 'ui-profile' | 'default' }
 * （segments 為去除頭尾斜線、正規化後的路徑段陣列）
 */
export function resolveArtifactsRoot() {
  const { kitDir } = resolveKitPaths();
  const profilePath = path.join(kitDir, 'ui-profile.md');
  let profileText = null;
  try {
    profileText = fs.readFileSync(profilePath, 'utf8');
  } catch {
    profileText = null;
  }
  if (profileText !== null) {
    const parsed = parseArtifactsRootFromProfile(profileText);
    if (parsed) return { segments: parsed.segments, raw: parsed.raw, source: 'ui-profile' };
    warn(`警告：無法從 ui-profile.md 解析「產物根目錄」，改用預設值 ${DEFAULT_ARTIFACTS_ROOT}。（檔案：${profilePath}）`);
  } else {
    warn(`警告：找不到 ui-profile.md，產物根目錄改用預設值 ${DEFAULT_ARTIFACTS_ROOT}。（預期路徑：${profilePath}）`);
  }
  return { segments: DEFAULT_ARTIFACTS_ROOT.split('/'), raw: DEFAULT_ARTIFACTS_ROOT, source: 'default' };
}

/**
 * 從 ui-profile.md 內容解析產物根目錄。
 * 逐行找含「產物根目錄」的行，依序嘗試：反引號內容 → 「產物根目錄：」後的 token。
 * 典型範本寫法：「產物根目錄（預設 `docs/ui-redesign/`，可依專案版控情況改變）」或
 * 「產物根目錄：ui-redesign-docs」。找到第一個能正規化為安全相對路徑的候選即採用。
 */
function parseArtifactsRootFromProfile(profileText) {
  for (const line of profileText.split(/\r?\n/)) {
    if (!line.includes('產物根目錄')) continue;
    const candidates = [];
    for (const match of line.matchAll(/`([^`]+)`/g)) candidates.push(match[1]);
    const colonMatch = line.match(/產物根目錄[:：]\s*([^\s|`，,；;]+)/);
    if (colonMatch) candidates.push(colonMatch[1]);
    for (const candidate of candidates) {
      const segments = normalizeRelativeDirSegments(candidate);
      if (segments) return { segments, raw: candidate.trim() };
    }
  }
  return null;
}

/**
 * 將候選值正規化為「安全的相對路徑段陣列」；不合法時回傳 null。
 * 允許字元：Unicode 字母／數字、點、底線、連字號（各段）；拒絕「..」「.」、
 * 空白、冒號、反斜線與其他符號，以避免路徑跳脫或絕對路徑混入。
 */
function normalizeRelativeDirSegments(value) {
  const cleaned = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const segments = cleaned.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return null;
  for (const segment of segments) {
    if (segment === '..' || segment === '.') return null;
    if (!/^[\p{L}\p{N}._\-]+$/u.test(segment)) return null;
  }
  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// 輸出路徑契約（shot/diff 的 --out、run 的腳本路徑）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 找出目標路徑「最深的存在祖先」並 realpath；回傳 { realAncestor, remainder }，
 * remainder 為尚不存在、待建立的相對段（由底層往上的順序會在此反轉）。
 * 存在部分若是符號連結，realpath 會解析到真實位置——後續前綴檢查即能擋下「符號連結脫離」。
 */
function realpathDeepestExisting(targetPath) {
  let current = targetPath;
  const remainder = [];
  for (;;) {
    if (fs.existsSync(current)) {
      return { realAncestor: fs.realpathSync(current), remainder: remainder.reverse() };
    }
    const parent = path.dirname(current);
    if (parent === current) break; // 已到磁碟根
    remainder.push(path.basename(current));
    current = parent;
  }
  die(2, `錯誤：無法解析路徑（連磁碟根都找不到）：${targetPath}`);
}

/**
 * 區段邊界的前綴比對（§6.2）。輸出段的結構必須是：
 *   <產物根目錄各段><slug 至少一段><kind 目錄（.artifacts 或 scripts）><至少一段檔案路徑>
 * kind 段以「第一次出現」為準；kind 之後允許任意子資料夾（例如 .artifacts/r1/xxx.png）。
 * path.relative 天然以整個目錄名為單位比對，不會發生 docs/ui-redesign 誤匹配
 * docs/ui-redesign-something 的情況（相對路徑會帶 ..，直接判為不符）。
 */
function matchOutputSegments(segments, artifactsRootSegments, kind) {
  const kindDirName = kindToDirName(kind);
  const kindIndex = segments.indexOf(kindDirName);
  if (kindIndex < 0) return { ok: false, reason: `路徑中沒有「${kindDirName}/」子樹` };
  if (kindIndex + 1 >= segments.length) return { ok: false, reason: `「${kindDirName}/」之後必須還有檔案路徑` };
  if (kindIndex < artifactsRootSegments.length + 1) return { ok: false, reason: '缺少頁面 slug 目錄' };
  for (let i = 0; i < artifactsRootSegments.length; i++) {
    if (segments[i] !== artifactsRootSegments[i]) {
      return {
        ok: false,
        reason: `不符合產物根目錄「${artifactsRootSegments.join('/')}」前綴（區段邊界比對）`,
      };
    }
  }
  return { ok: true };
}

/**
 * kind（'artifacts'／'scripts'）→ 輸出子樹的實際目錄名（'.artifacts'／'scripts'）。
 * CLI 參數語意用 kind；檔案系統段名以設計書 §9 為準（.artifacts 帶點）。
 */
function kindToDirName(kind) {
  if (kind === 'artifacts') return ARTIFACTS_SUBDIR;
  if (kind === 'scripts') return SCRIPTS_SUBDIR;
  return kind;
}

/**
 * 組合「拒絕」訊息（列出兩種允許前綴，方便 agent 修正呼叫參數） */
function outputRejectionMessage(label, requestedPath, realPath, kind) {
  const { projectRoot } = resolveKitPaths();
  const kindDir = kindToDirName(kind);
  return [
    `錯誤：${label}不在允許的輸出範圍內。`,
    `  拒絕的路徑：${requestedPath}`,
    `  realpath 解析後：${realPath}`,
    `  允許的輸出前綴（${kindDir}\\ 子樹）：`,
    `    ① <專案根>\\<產物根目錄>\\<slug>\\${kindDir}\\…（專案根：${projectRoot}）`,
    `    ② <專案根>\\.worktrees\\<任何名稱>\\<產物根目錄>\\<slug>\\${kindDir}\\…`,
    `  拒絕條件：含「..」、符號連結脫離、realpath 後落在集合之外（§6.2 輸出契約）。`,
  ].join('\n');
}

/**
 * 驗證「輸出路徑」（設計書 §6.2 路徑驗證契約）。
 * kind：'artifacts'（shot/diff 的 --out，限 .artifacts/ 子樹）或 'scripts'（run 的腳本，限 scripts/ 子樹）。
 * 相對路徑以「目前工作目錄」解析；驗證失敗時以結束碼 2 結束。
 * 回傳：realpath 校正後的絕對路徑。
 */
export function validateOutputPath(rawPath, kind, label = '輸出路徑') {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    die(2, `錯誤：${label}不可為空。`);
  }
  assertNoDotDot(rawPath, label);

  const { projectRoot } = resolveKitPaths();
  const { segments: artifactsRootSegments } = resolveArtifactsRoot();

  // 相對路徑以目前工作目錄解析；realpath 校正（輸出檔案本身通常尚不存在，取最深存在祖先）
  const requestedAbsolute = path.resolve(rawPath);
  const { realAncestor, remainder } = realpathDeepestExisting(requestedAbsolute);
  const realPath = remainder.length === 0 ? realAncestor : path.join(realAncestor, ...remainder);

  // 對專案根取相對並切段；落在專案根之外（含 .. 或磁碟根）一律拒絕
  const relativeFromRoot = path.relative(projectRoot, realPath);
  if (relativeFromRoot === '' || path.isAbsolute(relativeFromRoot) || relativeFromRoot.startsWith('..')) {
    die(2, outputRejectionMessage(label, rawPath, realPath, kind));
  }
  const segments = relativeFromRoot.split(path.sep);

  // 分支①：主工作區（或無 worktree 情境）
  const inMain = matchOutputSegments(segments, artifactsRootSegments, kind);
  if (inMain.ok) return realPath;

  // 分支②：worktree 內（<專案根>\.worktrees\<任何名稱>\…，目錄名不限）
  if (segments[0] === WORKTREES_DIR_NAME && segments.length > 1) {
    const inWorktree = matchOutputSegments(segments.slice(2), artifactsRootSegments, kind);
    if (inWorktree.ok) return realPath;
  }
  die(2, outputRejectionMessage(label, rawPath, realPath, kind));
}

/**
 * run 用：取得客製腳本的執行工作目錄——腳本位於 worktree 時為該 worktree 根，
 * 否則為專案根。（自行決策：腳本的相對路徑操作以所屬工作區根為基準，
 * 與「subagent 以 worktree 絕對路徑為 workdir」的工作目錄規則精神一致，§7.3。）
 */
export function getScriptWorkdir(absoluteScriptPath) {
  const { projectRoot } = resolveKitPaths();
  const relativeFromRoot = path.relative(projectRoot, absoluteScriptPath);
  const segments = relativeFromRoot.split(path.sep);
  if (segments[0] === WORKTREES_DIR_NAME && segments.length > 1) {
    return path.join(projectRoot, WORKTREES_DIR_NAME, segments[1]);
  }
  return projectRoot;
}

/** 建立輸出檔案的父目錄（僅可在 validateOutputPath 通過後呼叫，此時必在允許子樹內） */
export function ensureParentDir(absoluteFilePath) {
  fs.mkdirSync(path.dirname(absoluteFilePath), { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// URL 參數檔（A2 決策，§6.1）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 讀取 URL 參數檔（shot 截圖／量測兩種模式與 codegen 共用）。
 * 檔案內容為單一 JSON：{"url":"https://…","storageState":"可選檔案路徑"}。
 * 未知欄位予以忽略並警告（避免呼叫者拼錯欄位名而沒發現）。
 * storageState 為唯讀輸入：相對路徑以目前工作目錄解析（與其他 CLI 路徑參數一致）。
 * 回傳：{ url, storageStatePath, fileAbsPath }（storageStatePath 未提供時為 null）。
 */
export function readUrlFile(rawPath) {
  const fileAbsPath = validateInputPath(rawPath, '--url-file 參數檔路徑');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(fileAbsPath, 'utf8'));
  } catch (err) {
    die(2, `錯誤：--url-file 參數檔讀取或 JSON 解析失敗：${fileAbsPath}\n  原因：${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    die(2, `錯誤：--url-file 參數檔內容必須是單一 JSON 物件：${fileAbsPath}`);
  }
  const knownKeys = new Set(['url', 'storageState']);
  for (const key of Object.keys(parsed)) {
    if (!knownKeys.has(key)) warn(`警告：--url-file 參數檔的未知欄位已忽略：「${key}」`);
  }
  const url = parsed.url;
  if (typeof url !== 'string' || url.trim() === '') {
    die(2, `錯誤：--url-file 參數檔缺少「url」欄位（或非字串）：${fileAbsPath}`);
  }
  if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
    die(2, `錯誤：--url-file 的 url 僅接受 http://、https:// 或 file:// 網址（收到：${url.slice(0, 80)}）`);
  }
  let storageStatePath = null;
  if (parsed.storageState !== undefined && parsed.storageState !== null) {
    if (typeof parsed.storageState !== 'string' || parsed.storageState.trim() === '') {
      die(2, `錯誤：--url-file 的「storageState」欄位必須是檔案路徑字串：${fileAbsPath}`);
    }
    storageStatePath = validateInputPath(parsed.storageState, 'storageState 檔案路徑');
  }
  return { url, storageStatePath, fileAbsPath };
}

// ─────────────────────────────────────────────────────────────────────────────
// 其他共用檢查
// ─────────────────────────────────────────────────────────────────────────────

/** 檢查檔案開頭是否為 PNG 簽章（diff 僅支援 PNG；JPEG 請先轉檔，依賴清單不含 jpeg 解碼器） */
export function assertPngSignature(absolutePath, label) {
  const descriptor = fs.openSync(absolutePath, 'r');
  try {
    const header = Buffer.alloc(8);
    fs.readSync(descriptor, header, 0, 8, 0);
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
    if (!isPng) {
      die(2, `錯誤：${label}不是 PNG 檔（本工具僅支援 PNG；JPEG 請先轉成 PNG）：${absolutePath}`);
    }
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * 對外描述網址時遮蔽查詢字串（憑證不得出現在 log／產物，§5.2）。
 * file:// 網址為本機路徑，無憑證疑慮，直接回傳原樣。
 */
export function describeUrlForLog(url) {
  if (/^file:\/\//i.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.search) return url;
    return `${parsed.origin}${parsed.pathname}（查詢字串已省略，共 ${parsed.search.length} 字元）`;
  } catch {
    return `（無法解析的網址，長度 ${url.length}，內容省略）`;
  }
}
