import { chmod, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, ".local-docs");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "index.html");

const SUPPORTED_EXTENSIONS = new Set([".md", ".mdx", ".pdf", ".docx", ".txt", ".html"]);
const EXCLUDED_PATHS = [
  ".git",
  ".next",
  ".local-docs",
  "node_modules",
  "app/generated",
  "supabase/.temp",
];

const CATEGORY_ORDER = [
  { id: "start", label: "はじめに", icon: "book-open" },
  { id: "operations", label: "運用・引継ぎ", icon: "users" },
  { id: "users", label: "利用者向け", icon: "user" },
  { id: "technical", label: "技術・セキュリティ", icon: "shield" },
  { id: "database", label: "DB変更", icon: "database" },
  { id: "secret", label: "機密", icon: "lock" },
  { id: "other", label: "未分類", icon: "folder" },
];

const DESCRIPTIONS = new Map([
  ["README.md", "本番の場所、ローカル開発、検証方法と関連資料を案内する開始地点です。"],
  ["PROJECT_HANDOVER.md", "アーキテクチャ、API、DB、運用方針をまとめた技術引継ぎ資料です。"],
  ["VPS_DEPLOYMENT_GUIDE.md", "Ubuntu VPSへの初回配置と、その後の更新手順を説明します。"],
  ["USER_GUIDE.md", "生徒・保護者・管理者それぞれの利用手順をまとめています。"],
  ["docs/tech/INTERNAL_SPECS.md", "認証、DB整合性、重要ロジック、インフラの内部仕様です。"],
  ["prisma/manual-migrations/README.md", "セキュリティ用DB変更を適用する際の前提と注意事項です。"],
  [".secrets/PRODUCTION_CREDENTIALS.md", "本番接続情報と認証情報の保管・更新ルールです。"],
]);

const TITLE_OVERRIDES = new Map([
  ["README.md", "出欠管理システム — はじめに"],
  ["PROJECT_HANDOVER.md", "技術・運用マスターガイド"],
  ["VPS_DEPLOYMENT_GUIDE.md", "Ubuntu VPS デプロイガイド"],
  ["USER_GUIDE.md", "利用者マニュアル"],
  ["docs/tech/INTERNAL_SPECS.md", "内部技術仕様書"],
  ["prisma/manual-migrations/README.md", "セキュリティDB変更手順"],
  [".secrets/PRODUCTION_CREDENTIALS.md", "本番認証情報"],
]);

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

function isExcluded(relativePath) {
  return EXCLUDED_PATHS.some(
    (excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`),
  );
}

async function collectFiles(directory = ROOT_DIR) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalizeRelativePath(path.relative(ROOT_DIR, absolutePath));

    if (isExcluded(relativePath)) continue;

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(relativePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right, "ja"));
}

function categoryFor(relativePath) {
  if (relativePath.startsWith(".secrets/")) return "secret";
  if (relativePath === "README.md") return "start";
  if (relativePath === "PROJECT_HANDOVER.md" || relativePath === "PROJECT_HANDOVER.pdf") {
    return "operations";
  }
  if (
    relativePath === "VPS_DEPLOYMENT_GUIDE.md"
    || relativePath === "VPS_DEPLOYMENT_GUIDE.pdf"
  ) {
    return "operations";
  }
  if (relativePath === "USER_GUIDE.md" || relativePath === "USER_GUIDE.pdf") {
    return "users";
  }
  if (relativePath.startsWith("prisma/manual-migrations/")) return "database";
  if (relativePath.startsWith("docs/tech/")) return "technical";
  return "other";
}

function stripMarkdown(value) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMarkdownMetadata(content, relativePath) {
  const lines = content.split(/\r?\n/);
  const headings = [];
  let title = "";
  let description = "";
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headingMatch = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = stripMarkdown(headingMatch[2]);
      if (level === 1 && !title) title = text;
      if (level >= 2 && headings.length < 28) headings.push({ level, text });
      continue;
    }

    if (
      !description
      && line.trim()
      && !line.trim().startsWith("---")
      && !line.trim().startsWith("|")
      && !line.trim().startsWith("- ")
      && !line.trim().startsWith("> ")
    ) {
      const candidate = stripMarkdown(line);
      if (candidate && candidate !== title) description = candidate;
    }
  }

  return {
    title: TITLE_OVERRIDES.get(relativePath) || title || path.basename(relativePath),
    description:
      DESCRIPTIONS.get(relativePath)
      || description.slice(0, 120)
      || "このプロジェクトに関連する資料です。",
    headings,
  };
}

function fileHref(relativePath) {
  return `../${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function buildDocument(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  const fileStat = await stat(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();
  const sensitive = relativePath.startsWith(".secrets/");
  let metadata = {
    title: TITLE_OVERRIDES.get(relativePath) || path.basename(relativePath),
    description: DESCRIPTIONS.get(relativePath) || "このプロジェクトに関連する資料です。",
    headings: [],
  };

  if (!sensitive && (extension === ".md" || extension === ".mdx")) {
    metadata = extractMarkdownMetadata(await readFile(absolutePath, "utf8"), relativePath);
  }

  return {
    id: relativePath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase(),
    relativePath,
    href: fileHref(relativePath),
    extension,
    type:
      extension === ".md" || extension === ".mdx"
        ? "Markdown"
        : extension.slice(1).toUpperCase(),
    category: categoryFor(relativePath),
    sensitive,
    title: metadata.title,
    description: metadata.description,
    headings: sensitive ? [] : metadata.headings,
    modifiedTimestamp: fileStat.mtimeMs,
    modifiedDate: formatDate(fileStat.mtime),
    modifiedDateTime: formatDateTime(fileStat.mtime),
    size: formatFileSize(fileStat.size),
  };
}

function icon(name, size = 20) {
  const icons = {
    "book-open": '<path d="M2.5 4.5a3 3 0 0 1 3-3H11v17H5.5a3 3 0 0 0-3 3z"/><path d="M21.5 4.5a3 3 0 0 0-3-3H13v17h5.5a3 3 0 0 1 3 3z"/>',
    database: '<ellipse cx="12" cy="5" rx="8.5" ry="3.5"/><path d="M3.5 5v7c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5V5"/><path d="M3.5 12v7c0 1.9 3.8 3.5 8.5 3.5s8.5-1.6 8.5-3.5v-7"/>',
    document: '<path d="M6 2.5h8l4 4v15H6z"/><path d="M14 2.5v4h4M9 11h6M9 15h6"/>',
    folder: '<path d="M2.5 6.5h7l2-2h10v15h-19z"/>',
    lock: '<rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    refresh: '<path d="M20 7v5h-5"/><path d="M19 12a7.5 7.5 0 1 0-1.2 5.2"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    shield: '<path d="M12 2.5 20 6v6c0 5-3.2 8.3-8 10-4.8-1.7-8-5-8-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    user: '<circle cx="12" cy="7.5" r="4"/><path d="M4.5 21c.7-4.2 3.2-6.5 7.5-6.5s6.8 2.3 7.5 6.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.8 2.7-5.8 6.5-5.8s5.9 2 6.5 5.8"/><path d="M15 5.2a3.5 3.5 0 0 1 0 6.6M16 14.7c3.1.5 4.8 2.3 5.5 5.3"/>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.document}</svg>`;
}

function buildHtml({ documents, physicalDocumentCount, latestDate, generatedAt }) {
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map(({ id }) => [id, 0]));
  for (const document of documents) {
    categoryCounts[document.category] += 1 + (document.pdfMirror ? 1 : 0);
  }

  const categories = [
    { id: "all", label: "すべて", icon: "document", count: physicalDocumentCount },
    ...CATEGORY_ORDER.filter(({ id }) => categoryCounts[id] > 0).map((category) => ({
      ...category,
      count: categoryCounts[category.id],
    })),
  ];

  const data = JSON.stringify({ documents, categories }).replaceAll("<", "\\u003c");
  const repositoryPath = ROOT_DIR.replace(/^\/Users\/[^/]+/, "/Users/…");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232557d6' stroke-width='1.8'%3E%3Cpath d='M2.5 6.5h7l2-2h10v15h-19z'/%3E%3C/svg%3E">
  <title>入退室システム 文書ハブ</title>
  <style>
    :root {
      --bg: #f7f9fc;
      --surface: #ffffff;
      --surface-subtle: #f8faff;
      --text: #13213a;
      --text-soft: #5b6880;
      --text-faint: #7d899e;
      --border: #d9e0ea;
      --border-strong: #c8d2e1;
      --accent: #2557d6;
      --accent-soft: #edf3ff;
      --accent-hover: #1947bd;
      --danger: #c92c3a;
      --danger-soft: #fff1f2;
      --warning: #9a5a00;
      --warning-soft: #fff7e8;
      --success: #1f7a4c;
      --success-soft: #edf9f2;
      --shadow: 0 12px 35px rgba(27, 44, 77, 0.12);
      --radius: 8px;
      --sidebar: 236px;
      --preview: 330px;
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic UI",
        "Yu Gothic", "Noto Sans JP", sans-serif;
      color: var(--text);
      background: var(--bg);
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      min-height: 100%;
      background: var(--bg);
    }

    body {
      font-size: 14px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }

    button, input { font: inherit; }
    button, a { -webkit-tap-highlight-color: transparent; }
    a { color: inherit; }

    .app {
      min-height: 100vh;
      display: grid;
      grid-template:
        "header header header" 64px
        "sidebar main preview" calc(100vh - 64px)
        / var(--sidebar) minmax(520px, 1fr) var(--preview);
    }

    .header {
      grid-area: header;
      position: sticky;
      top: 0;
      z-index: 20;
      display: grid;
      grid-template-columns: var(--sidebar) minmax(320px, 1fr) var(--preview);
      align-items: center;
      border-bottom: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.97);
    }

    .brand {
      height: 100%;
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 0 20px;
      border-right: 1px solid var(--border);
    }

    .brand-mark {
      color: var(--accent);
      display: grid;
      place-items: center;
    }

    .brand-text {
      min-width: 0;
    }

    .brand-title {
      display: block;
      font-size: 16px;
      font-weight: 760;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }

    .brand-status {
      display: block;
      color: var(--text-faint);
      font-size: 11px;
      white-space: nowrap;
    }

    .header-center {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 22px;
    }

    .search-wrap {
      position: relative;
      flex: 1;
    }

    .search-icon {
      position: absolute;
      left: 13px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-faint);
      pointer-events: none;
    }

    .search {
      width: 100%;
      height: 40px;
      padding: 0 42px 0 42px;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius);
      outline: none;
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }

    .search:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(37, 87, 214, 0.12);
    }

    .search-shortcut {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-faint);
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0 5px;
      background: var(--surface-subtle);
    }

    .header-actions {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 0 18px;
      border-left: 1px solid var(--border);
    }

    .button {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border: 1px solid var(--border-strong);
      border-radius: 7px;
      padding: 0 12px;
      background: var(--surface);
      color: var(--text);
      font-weight: 650;
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
      transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
    }

    .button:hover {
      color: var(--accent);
      border-color: #9db4ea;
      background: var(--accent-soft);
    }

    .button.primary {
      color: #fff;
      background: var(--accent);
      border-color: var(--accent);
    }

    .button.primary:hover {
      color: #fff;
      background: var(--accent-hover);
    }

    .button.small {
      min-height: 30px;
      padding: 0 9px;
      font-size: 12px;
    }

    .sidebar {
      grid-area: sidebar;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: auto;
      border-right: 1px solid var(--border);
      background: var(--surface);
      padding: 18px 12px 14px;
    }

    .nav {
      display: grid;
      gap: 4px;
    }

    .nav-button {
      width: 100%;
      min-height: 42px;
      display: grid;
      grid-template-columns: 24px 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 0 11px;
      color: #435069;
      background: transparent;
      border: 0;
      border-radius: 7px;
      text-align: left;
      cursor: pointer;
    }

    .nav-button:hover {
      background: var(--surface-subtle);
      color: var(--text);
    }

    .nav-button[aria-current="true"] {
      color: var(--accent);
      background: var(--accent-soft);
      font-weight: 720;
    }

    .nav-count {
      color: var(--text-faint);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .nav-button[aria-current="true"] .nav-count { color: var(--accent); }

    .repository {
      margin-top: auto;
      padding: 16px 8px 4px;
      border-top: 1px solid var(--border);
      color: var(--text-faint);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      overflow-wrap: anywhere;
    }

    .repository-label {
      display: block;
      margin-bottom: 5px;
      color: var(--text-soft);
      font-family: inherit;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .main {
      grid-area: main;
      min-width: 0;
      overflow: auto;
      background: var(--surface);
    }

    .main-inner {
      width: min(100%, 960px);
      margin: 0 auto;
      padding: 32px 30px 48px;
    }

    .intro {
      padding-bottom: 22px;
      border-bottom: 1px solid var(--border);
    }

    h1 {
      margin: 0 0 7px;
      font-size: clamp(25px, 2.3vw, 32px);
      line-height: 1.25;
      letter-spacing: -0.035em;
    }

    .intro-copy {
      margin: 0;
      color: var(--text-soft);
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin-top: 20px;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .metric {
      min-height: 68px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      color: var(--text-soft);
    }

    .metric + .metric { border-left: 1px solid var(--border); }
    .metric strong {
      display: block;
      color: var(--text);
      font-size: 20px;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
    }
    .metric span { display: block; font-size: 12px; }

    .section-title {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 24px 0 12px;
      font-size: 16px;
      font-weight: 760;
    }

    .section-title::before {
      content: "";
      width: 3px;
      height: 20px;
      border-radius: 2px;
      background: var(--accent);
    }

    .start-document {
      display: grid;
      grid-template-columns: 44px 1fr auto;
      gap: 14px;
      align-items: center;
      padding: 17px;
      border: 1px solid #9db4ea;
      border-radius: var(--radius);
      background: #fbfdff;
    }

    .file-icon {
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      color: var(--accent);
      border: 1px solid #b9c9ec;
      border-radius: 7px;
      background: var(--surface);
      flex: 0 0 auto;
    }

    .document-title {
      margin: 0;
      font-size: 15px;
      font-weight: 760;
      line-height: 1.3;
    }

    .document-description {
      margin: 3px 0 6px;
      color: var(--text-soft);
      font-size: 12px;
    }

    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 5px 12px;
      align-items: center;
      color: var(--text-faint);
      font-size: 11px;
    }

    code.path {
      max-width: 100%;
      padding: 2px 6px;
      color: #4b5870;
      background: #f4f6fa;
      border: 1px solid var(--border);
      border-radius: 4px;
      font: 10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }

    .start-actions {
      display: flex;
      gap: 8px;
    }

    .list-header {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
      margin-top: 26px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border-strong);
    }

    .list-header h2 {
      margin: 0;
      font-size: 17px;
    }

    .list-status {
      color: var(--text-faint);
      font-size: 11px;
    }

    .documents {
      display: grid;
    }

    .document-row {
      position: relative;
      display: grid;
      grid-template-columns: 36px minmax(180px, 1.25fr) minmax(130px, .8fr) 78px 88px;
      gap: 12px;
      align-items: center;
      min-height: 88px;
      padding: 13px 8px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      transition: background 120ms ease;
    }

    .document-row:hover,
    .document-row.selected {
      background: #f7faff;
    }

    .document-row.selected::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--accent);
    }

    .document-row.sensitive {
      background: #fffafa;
    }

    .document-row.sensitive::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 3px;
      background: var(--danger);
    }

    .row-icon {
      color: #354159;
      display: grid;
      place-items: center;
    }

    .document-row.sensitive .row-icon { color: var(--danger); }

    .row-copy { min-width: 0; }
    .row-title {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      align-items: center;
      margin: 0 0 3px;
      font-size: 13px;
      font-weight: 760;
      overflow-wrap: anywhere;
    }

    .row-description {
      margin: 0;
      color: var(--text-soft);
      font-size: 11px;
      line-height: 1.45;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 20px;
      padding: 0 6px;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-soft);
      background: var(--surface);
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }

    .tag.danger {
      color: var(--danger);
      border-color: #f0b6bd;
      background: var(--danger-soft);
    }

    .tag.success {
      color: var(--success);
      border-color: #b8dec9;
      background: var(--success-soft);
    }

    .tag.warning {
      color: var(--warning);
      border-color: #edd4a7;
      background: var(--warning-soft);
    }

    .row-path {
      min-width: 0;
    }

    .row-meta {
      color: var(--text-faint);
      font-size: 11px;
    }

    .row-actions {
      display: grid;
      gap: 4px;
      justify-items: start;
    }

    .text-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 0;
      color: var(--accent);
      border: 0;
      background: transparent;
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }

    .text-link:hover { text-decoration: underline; }
    .text-link.pdf { color: #b72734; }

    .empty {
      display: none;
      padding: 42px 20px;
      color: var(--text-soft);
      text-align: center;
      border-bottom: 1px solid var(--border);
    }

    .empty.visible { display: block; }

    .preview {
      grid-area: preview;
      min-height: 0;
      overflow: auto;
      border-left: 1px solid var(--border);
      background: var(--surface);
      padding: 22px 20px 30px;
    }

    .preview-header {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    .preview-kicker {
      margin: 0 0 3px;
      color: var(--text-faint);
      font-size: 10px;
      font-weight: 720;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .preview-title {
      margin: 0;
      font-size: 14px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }

    .preview-description {
      margin: 13px 0 0;
      color: var(--text-soft);
      font-size: 12px;
    }

    .preview-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 16px 0 20px;
    }

    .preview-actions .button:only-child { grid-column: 1 / -1; }

    .preview-section {
      margin-top: 18px;
    }

    .preview-section h3 {
      margin: 0 0 10px;
      font-size: 13px;
    }

    .toc {
      display: grid;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .toc li {
      color: #334159;
      font-size: 11px;
      line-height: 1.45;
    }

    .toc li.level-2 {
      color: var(--accent);
      font-weight: 720;
      margin-top: 5px;
    }

    .toc li.level-3 {
      padding-left: 14px;
    }

    .preview-note {
      padding: 12px;
      border-left: 3px solid var(--danger);
      background: var(--danger-soft);
      color: #7e2630;
      font-size: 11px;
    }

    .preview-footer {
      margin-top: 24px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      color: var(--text-faint);
      font-size: 10px;
    }

    dialog {
      width: min(520px, calc(100vw - 32px));
      padding: 0;
      border: 1px solid var(--border-strong);
      border-radius: 10px;
      box-shadow: var(--shadow);
      color: var(--text);
    }

    dialog::backdrop { background: rgba(18, 32, 58, 0.38); }

    .dialog-body { padding: 22px; }
    .dialog-body h2 { margin: 0 0 7px; font-size: 18px; }
    .dialog-body p { margin: 0; color: var(--text-soft); }

    .command {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 18px 0;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: #f5f7fb;
    }

    .command code {
      flex: 1;
      font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 22px;
      border-top: 1px solid var(--border);
      background: var(--surface-subtle);
    }

    .toast {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 50;
      padding: 10px 14px;
      color: #fff;
      background: #152441;
      border-radius: 7px;
      box-shadow: var(--shadow);
      font-size: 12px;
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease;
    }

    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }

    @media (max-width: 1120px) {
      :root { --preview: 300px; --sidebar: 210px; }
      .document-row {
        grid-template-columns: 32px minmax(180px, 1fr) 120px 74px;
      }
      .row-meta.size { display: none; }
    }

    @media (max-width: 900px) {
      .app {
        grid-template:
          "header header" auto
          "sidebar main" minmax(0, 1fr)
          / 190px minmax(0, 1fr);
      }
      .header {
        grid-template-columns: 190px minmax(0, 1fr);
        min-height: 64px;
      }
      .header-actions { display: none; }
      .preview {
        position: fixed;
        inset: 64px 0 0 auto;
        z-index: 30;
        width: min(360px, calc(100vw - 40px));
        box-shadow: -16px 0 35px rgba(27, 44, 77, 0.15);
        transform: translateX(105%);
        transition: transform 180ms ease;
      }
      .preview.open { transform: translateX(0); }
      .main-inner { padding-inline: 24px; }
    }

    @media (max-width: 680px) {
      .app {
        display: block;
        min-height: 100vh;
      }
      .header {
        position: sticky;
        display: grid;
        grid-template-columns: 1fr auto;
        min-height: auto;
        padding: 11px 12px;
      }
      .brand {
        height: auto;
        padding: 0;
        border: 0;
      }
      .brand-status { display: none; }
      .header-center {
        grid-column: 1 / -1;
        grid-row: 2;
        padding: 10px 0 0;
      }
      .header-actions {
        display: flex;
        grid-column: 2;
        grid-row: 1;
        padding: 0;
        border: 0;
      }
      .header-actions .button span { display: none; }
      .sidebar {
        position: sticky;
        top: 113px;
        z-index: 15;
        display: block;
        padding: 8px 12px;
        border: 0;
        border-bottom: 1px solid var(--border);
        overflow-x: auto;
      }
      .nav {
        display: flex;
        width: max-content;
      }
      .nav-button {
        width: auto;
        min-height: 34px;
        grid-template-columns: 18px auto auto;
        gap: 6px;
        padding: 0 10px;
        white-space: nowrap;
      }
      .nav-button svg { width: 16px; height: 16px; }
      .repository { display: none; }
      .main { overflow: visible; }
      .main-inner { padding: 24px 14px 40px; }
      .metrics { grid-template-columns: 1fr; }
      .metric + .metric { border-left: 0; border-top: 1px solid var(--border); }
      .start-document {
        grid-template-columns: 38px 1fr;
      }
      .start-actions {
        grid-column: 1 / -1;
      }
      .start-actions .button { flex: 1; }
      .document-row {
        grid-template-columns: 28px minmax(0, 1fr);
        gap: 8px 10px;
        padding: 15px 6px;
      }
      .row-path, .row-meta, .row-actions {
        grid-column: 2;
      }
      .row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .preview { top: 113px; }
      .list-header { align-items: start; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.001ms !important;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="header">
      <div class="brand">
        <span class="brand-mark">${icon("folder", 26)}</span>
        <span class="brand-text">
          <span class="brand-title">入退室システム 文書ハブ</span>
          <span class="brand-status">ローカル専用・自動生成</span>
        </span>
      </div>
      <div class="header-center">
        <label class="search-wrap">
          <span class="search-icon">${icon("search", 18)}</span>
          <input id="search" class="search" type="search" placeholder="文書・目的・パス・見出しを検索" autocomplete="off">
          <span class="search-shortcut">/</span>
        </label>
      </div>
      <div class="header-actions">
        <button class="button" id="regenerateButton" type="button">
          ${icon("refresh", 17)}
          <span>一覧を再生成</span>
        </button>
      </div>
    </header>

    <aside class="sidebar">
      <nav class="nav" id="categoryNav" aria-label="文書カテゴリ"></nav>
      <div class="repository">
        <span class="repository-label">REPOSITORY</span>
        ${escapeHtml(repositoryPath)}
      </div>
    </aside>

    <main class="main">
      <div class="main-inner">
        <section class="intro">
          <h1>必要な資料へ、迷わず到達する</h1>
          <p class="intro-copy">元ファイルはそのままの場所に残し、このページを全資料の索引として使います。</p>
          <div class="metrics" aria-label="文書統計">
            <div class="metric">${icon("document", 23)}<div><strong>${physicalDocumentCount}</strong><span>件のドキュメント</span></div></div>
            <div class="metric">${icon("document", 23)}<div><strong>${documents.filter((document) => document.pdfMirror).length}</strong><span>件のPDFミラー</span></div></div>
            <div class="metric">${icon("book-open", 23)}<div><strong>${escapeHtml(latestDate)}</strong><span>最終更新</span></div></div>
          </div>
        </section>

        <section>
          <h2 class="section-title">まずここから</h2>
          <div class="start-document" id="startDocument"></div>
        </section>

        <section>
          <div class="list-header">
            <h2>ドキュメント一覧</h2>
            <span class="list-status" id="listStatus"></span>
          </div>
          <div class="documents" id="documentList"></div>
          <div class="empty" id="emptyState">
            条件に一致する資料はありません。検索語またはカテゴリを変更してください。
          </div>
        </section>
      </div>
    </main>

    <aside class="preview" id="preview" aria-label="文書プレビュー"></aside>
  </div>

  <dialog id="regenerateDialog">
    <div class="dialog-body">
      <h2>文書一覧を再生成</h2>
      <p>文書を追加・更新した後、プロジェクトのターミナルで次を実行してください。</p>
      <div class="command">
        <code id="regenerateCommand">npm run docs:hub</code>
        <button class="button small" id="copyCommand" type="button">コピー</button>
      </div>
      <p>生成先は <code class="path">.local-docs/index.html</code> です。ページを再読み込みすると更新内容が反映されます。</p>
    </div>
    <div class="dialog-actions">
      <button class="button" id="closeDialog" type="button">閉じる</button>
    </div>
  </dialog>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <script>
    const DATA = ${data};
    const ICONS = {
      document: ${JSON.stringify(icon("document", 19))},
      folder: ${JSON.stringify(icon("folder", 18))},
      lock: ${JSON.stringify(icon("lock", 19))},
      "book-open": ${JSON.stringify(icon("book-open", 19))},
      database: ${JSON.stringify(icon("database", 19))},
      search: ${JSON.stringify(icon("search", 19))},
      shield: ${JSON.stringify(icon("shield", 19))},
      user: ${JSON.stringify(icon("user", 19))},
      users: ${JSON.stringify(icon("users", 19))},
    };

    const state = {
      category: "all",
      query: "",
      selectedId: DATA.documents.find((document) => document.relativePath === "PROJECT_HANDOVER.md")?.id
        || DATA.documents[0]?.id,
    };

    const elements = {
      categoryNav: document.querySelector("#categoryNav"),
      documentList: document.querySelector("#documentList"),
      emptyState: document.querySelector("#emptyState"),
      listStatus: document.querySelector("#listStatus"),
      preview: document.querySelector("#preview"),
      search: document.querySelector("#search"),
      startDocument: document.querySelector("#startDocument"),
      regenerateButton: document.querySelector("#regenerateButton"),
      regenerateDialog: document.querySelector("#regenerateDialog"),
      closeDialog: document.querySelector("#closeDialog"),
      copyCommand: document.querySelector("#copyCommand"),
      toast: document.querySelector("#toast"),
    };

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function showToast(message) {
      elements.toast.textContent = message;
      elements.toast.classList.add("visible");
      window.clearTimeout(showToast.timeout);
      showToast.timeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 1800);
    }

    function renderNavigation() {
      elements.categoryNav.innerHTML = DATA.categories.map((category) => \`
        <button class="nav-button" type="button" data-category="\${category.id}" aria-current="\${state.category === category.id}">
          <span>\${ICONS[category.icon] || ICONS.folder}</span>
          <span>\${escapeHtml(category.label)}</span>
          <span class="nav-count">\${category.count}</span>
        </button>
      \`).join("");
    }

    function renderStartDocument() {
      const document = DATA.documents.find((item) => item.relativePath === "README.md") || DATA.documents[0];
      if (!document) {
        elements.startDocument.innerHTML = "<p>開始文書が見つかりません。</p>";
        return;
      }
      elements.startDocument.innerHTML = \`
        <span class="file-icon">\${ICONS["book-open"]}</span>
        <div>
          <h3 class="document-title">\${escapeHtml(document.title)}</h3>
          <p class="document-description">\${escapeHtml(document.description)}</p>
          <div class="metadata">
            <code class="path">./\${escapeHtml(document.relativePath)}</code>
            <span>更新: \${escapeHtml(document.modifiedDate)}</span>
          </div>
        </div>
        <div class="start-actions">
          <button class="button" type="button" data-preview-id="\${document.id}">プレビュー</button>
          <a class="button primary" href="\${document.href}" target="_blank" rel="noreferrer">元ファイルを開く</a>
        </div>
      \`;
    }

    function searchText(document) {
      return [
        document.title,
        document.description,
        document.relativePath,
        document.type,
        ...(document.headings || []).map((heading) => heading.text),
        document.pdfMirror?.relativePath || "",
      ].join(" ").toLocaleLowerCase("ja");
    }

    function filteredDocuments() {
      const query = state.query.trim().toLocaleLowerCase("ja");
      return DATA.documents.filter((document) => {
        if (state.category !== "all" && document.category !== state.category) return false;
        return !query || searchText(document).includes(query);
      });
    }

    function followFilteredSelection() {
      const documents = filteredDocuments();
      if (!documents.some((document) => document.id === state.selectedId)) {
        state.selectedId = documents[0]?.id || null;
      }
    }

    function renderDocuments() {
      const documents = filteredDocuments();
      elements.listStatus.textContent = \`\${documents.length} / \${DATA.documents.length} 行を表示（PDFは同じ行に集約）\`;
      elements.emptyState.classList.toggle("visible", documents.length === 0);
      elements.documentList.innerHTML = documents.map((document) => {
        const pdfStatus = document.pdfMirror
          ? document.pdfMirror.stale
            ? '<span class="tag warning">PDF要更新</span>'
            : '<span class="tag success">PDF同期済み</span>'
          : "";
        const sensitiveTags = document.sensitive
          ? '<span class="tag danger">Git管理外</span><span class="tag danger">画面共有禁止</span>'
          : "";
        const pdfLink = document.pdfMirror
          ? \`<a class="text-link pdf" href="\${document.pdfMirror.href}" target="_blank" rel="noreferrer">PDF版</a>\`
          : "";
        return \`
          <article class="document-row \${document.sensitive ? "sensitive" : ""} \${state.selectedId === document.id ? "selected" : ""}"
            data-document-id="\${document.id}" tabindex="0">
            <span class="row-icon">\${document.sensitive ? ICONS.lock : ICONS.document}</span>
            <div class="row-copy">
              <h3 class="row-title">\${escapeHtml(document.title)} \${sensitiveTags} \${pdfStatus}</h3>
              <p class="row-description">\${escapeHtml(document.description)}</p>
            </div>
            <div class="row-path">
              <code class="path">./\${escapeHtml(document.relativePath)}</code>
            </div>
            <div class="row-meta">
              <strong>\${escapeHtml(document.type)}</strong><br>
              \${escapeHtml(document.modifiedDate)}
            </div>
            <div class="row-actions">
              <button class="text-link" type="button" data-preview-id="\${document.id}">プレビュー</button>
              <a class="text-link" href="\${document.href}" target="_blank" rel="noreferrer">元ファイル</a>
              \${pdfLink}
            </div>
          </article>
        \`;
      }).join("");
    }

    function renderPreview() {
      const document = DATA.documents.find((item) => item.id === state.selectedId);
      if (!document) {
        elements.preview.innerHTML = '<p class="row-description">表示する文書を選択してください。</p>';
        return;
      }

      const toc = document.sensitive
        ? '<div class="preview-note">機密情報はこのHTMLへ埋め込んでいません。元ファイルを開くときは画面共有を停止してください。</div>'
        : document.headings.length
          ? \`<ul class="toc">\${document.headings.map((heading) =>
              \`<li class="level-\${heading.level}">\${escapeHtml(heading.text)}</li>\`
            ).join("")}</ul>\`
          : '<p class="row-description">目次を抽出できない形式です。元ファイルを開いて確認してください。</p>';

      elements.preview.innerHTML = \`
        <div class="preview-header">
          <div>
            <p class="preview-kicker">プレビュー</p>
            <h2 class="preview-title">\${escapeHtml(document.title)}</h2>
          </div>
        </div>
        <p class="preview-description">\${escapeHtml(document.description)}</p>
        <div class="preview-actions">
          <a class="button" href="\${document.href}" target="_blank" rel="noreferrer">元ファイル</a>
          \${document.pdfMirror
            ? \`<a class="button" href="\${document.pdfMirror.href}" target="_blank" rel="noreferrer">PDF版</a>\`
            : ""}
        </div>
        <div class="metadata">
          <code class="path">./\${escapeHtml(document.relativePath)}</code>
          <span>\${escapeHtml(document.size)}</span>
          <span>\${escapeHtml(document.modifiedDateTime)} 更新</span>
        </div>
        <section class="preview-section">
          <h3>\${document.sensitive ? "取扱注意" : "目次"}</h3>
          \${toc}
        </section>
        <p class="preview-footer">索引生成: ${escapeHtml(generatedAt)}<br>元文書を変更したら「一覧を再生成」を実行してください。</p>
      \`;
    }

    function render() {
      renderNavigation();
      renderDocuments();
      renderPreview();
    }

    elements.categoryNav.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.category = button.dataset.category;
      followFilteredSelection();
      render();
    });

    elements.search.addEventListener("input", () => {
      state.query = elements.search.value;
      followFilteredSelection();
      renderDocuments();
      renderPreview();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && document.activeElement !== elements.search) {
        event.preventDefault();
        elements.search.focus();
      }
      if (event.key === "Escape") {
        elements.preview.classList.remove("open");
      }
    });

    document.addEventListener("click", (event) => {
      const previewButton = event.target.closest("[data-preview-id]");
      if (previewButton) {
        state.selectedId = previewButton.dataset.previewId;
        renderDocuments();
        renderPreview();
        elements.preview.classList.add("open");
        return;
      }

      const row = event.target.closest("[data-document-id]");
      if (row && !event.target.closest("a, button")) {
        state.selectedId = row.dataset.documentId;
        renderDocuments();
        renderPreview();
        elements.preview.classList.add("open");
      }
    });

    document.addEventListener("keydown", (event) => {
      const row = event.target.closest("[data-document-id]");
      if (row && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        state.selectedId = row.dataset.documentId;
        renderDocuments();
        renderPreview();
        elements.preview.classList.add("open");
      }
    });

    elements.regenerateButton.addEventListener("click", () => elements.regenerateDialog.showModal());
    elements.closeDialog.addEventListener("click", () => elements.regenerateDialog.close());
    elements.regenerateDialog.addEventListener("click", (event) => {
      if (event.target === elements.regenerateDialog) elements.regenerateDialog.close();
    });
    elements.copyCommand.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText("npm run docs:hub");
        showToast("再生成コマンドをコピーしました");
      } catch {
        showToast("コピーできませんでした");
      }
    });

    renderStartDocument();
    render();
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function main() {
  const allFiles = await collectFiles();
  const builtDocuments = await Promise.all(allFiles.map(buildDocument));
  const documentByPath = new Map(
    builtDocuments.map((document) => [document.relativePath, document]),
  );
  const pairedPdfPaths = new Set();
  const documents = [];

  for (const document of builtDocuments) {
    if (document.extension === ".pdf") continue;

    const basePath = document.relativePath.replace(/\.(md|mdx)$/i, "");
    const pdfPath = `${basePath}.pdf`;
    const pdf = documentByPath.get(pdfPath);
    if (pdf) {
      document.pdfMirror = {
        relativePath: pdf.relativePath,
        href: pdf.href,
        modifiedDate: pdf.modifiedDate,
        modifiedDateTime: pdf.modifiedDateTime,
        size: pdf.size,
        stale: pdf.modifiedTimestamp < document.modifiedTimestamp,
      };
      pairedPdfPaths.add(pdfPath);
    }
    documents.push(document);
  }

  for (const pdf of builtDocuments.filter(
    (document) => document.extension === ".pdf" && !pairedPdfPaths.has(document.relativePath),
  )) {
    documents.push(pdf);
  }

  documents.sort((left, right) => {
    const categoryDifference =
      CATEGORY_ORDER.findIndex(({ id }) => id === left.category)
      - CATEGORY_ORDER.findIndex(({ id }) => id === right.category);
    if (categoryDifference !== 0) return categoryDifference;
    if (left.relativePath === "README.md") return -1;
    if (right.relativePath === "README.md") return 1;
    return left.relativePath.localeCompare(right.relativePath, "ja");
  });

  const latestTimestamp = Math.max(...builtDocuments.map((document) => document.modifiedTimestamp));
  const generatedAt = formatDateTime(new Date());
  const html = buildHtml({
    documents,
    physicalDocumentCount: builtDocuments.length,
    latestDate: formatDate(new Date(latestTimestamp)),
    generatedAt,
  });

  await mkdir(OUTPUT_DIR, { recursive: true, mode: 0o700 });
  await writeFile(OUTPUT_FILE, html, { encoding: "utf8", mode: 0o600 });
  await chmod(OUTPUT_DIR, 0o700);
  await chmod(OUTPUT_FILE, 0o600);

  console.log(`文書ハブを生成しました: ${path.relative(ROOT_DIR, OUTPUT_FILE)}`);
  console.log(`対象ファイル: ${builtDocuments.length}件 / 一覧行: ${documents.length}件`);
}

await main();
