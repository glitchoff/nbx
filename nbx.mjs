#!/usr/bin/env node
// nbx — convert .md master-source notebooks to clean .ipynb/.html/.md/PDF reports.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve, basename, extname, join } from 'path';
import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import os from 'os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = require('./package.json');
const VERSION = pkg.version;

// ---------------------------------------------------------------------------
// Tiny CLI arg parser
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    execute: true, pdf: true, html: true, ipynb: true, md: false,
    merge: true, open: false, raw: false, quiet: false, keep: false,
    theme: 'plain', margins: 'normal', scale: 1,
    output: null, cwd: process.cwd(),
  };
  const files = [];
  const known = {
    '--execute': ['execute', true], '--no-execute': ['execute', false],
    '--pdf': ['pdf', true], '--no-pdf': ['pdf', false],
    '--html': ['html', true], '--no-html': ['html', false],
    '--ipynb': ['ipynb', true], '--no-ipynb': ['ipynb', false],
    '--md': ['md', true], '--raw': ['raw', true],
    '--merge': ['merge', true], '--no-merge': ['merge', false],
    '--open': ['open', true], '--keep': ['keep', true], '--quiet': ['quiet', true],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output' || a === '-o') { opts.output = argv[++i]; continue; }
    if (a === '--theme') { opts.theme = argv[++i]; continue; }
    if (a === '--margins') { opts.margins = argv[++i]; continue; }
    if (a === '--scale') { opts.scale = parseFloat(argv[++i]) || 1; continue; }
    if (a === '--cwd') { opts.cwd = resolve(argv[++i]); continue; }
    if (a === '--version' || a === '-v') { console.log(`nbx v${VERSION}`); process.exit(0); }
    if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    if (a.startsWith('--')) {
      const key = known[a];
      if (key) opts[key[0]] = key[1]; else { console.error(`Unknown flag: ${a}`); process.exit(1); }
      continue;
    }
    files.push(a);
  }
  return { opts, files };
}

function printHelp() {
  console.log(`
nbx v${VERSION} — .md master-source notebooks to clean reports

Usage:
  nbx <file.md> [file2.md ...] [flags]
  nbx <folder>                # process every *.md in the folder
  nbx --all                   # process every lab*/ in the cwd

Converts each .md master source into:
  .ipynb  a clean, re-executed Jupyter notebook
  .html   a standalone, designed report
  .pdf    an A4 print (Times New Roman, page numbers, cover, TOC)
  .md     the raw-mode markdown render of the same source

The .md master is a plain Markdown file. Cells are separated by a line of
three-or-more "=" characters. A cell's type is given by a leading line:

  ---                       markdown cell (default)
  Cell: code                executable code cell
  Cell: raw                 raw cell (directives live here)
  Cell: markdown            markdown cell

Directives inside raw cells use ::: fences, e.g.

  :::title<DATA SCIENCE PRACTICAL FILE>
  :::subtitle<PRACTICAL 1 — DETECT MISSING VALUES>
  :::date<Date of Conduct :: October 2026>
  :::meta<Course Code :: XXXXX>
  :::meta<Roll Number :: XXXXX>
  :::index<INDEX>
  :::section<1. CHECK MISSING VALUES>
  :::question<Q1 ...>
  :::answer
  :::note<...>   :::tip<...>   :::warning<...>   :::keypoint<...>
  :::figure<Caption text>
  :::code<...>   :::output<...>
  :::metric<R^2 :: 0.9055>
  :::observation<...>  :::result<...>
  :::pagebreak  :::oddpage  :::appendix

Flags:
  --execute / --no-execute   run cells (default: execute)
  --pdf / --no-pdf           emit PDF (default: yes)
  --html / --no-html         emit HTML (default: yes)
  --ipynb / --no-ipynb       emit .ipynb (default: yes)
  --md                       also emit raw-mode .md render
  --raw                      alias for --md
  --merge / --no-merge       merge multi-file runs into one PDF
  --output NAME              output base name (default: <source base>)
  --theme NAME               academic | modern | plain
  --margins LVL              minimal | low | mid | normal | high
  --scale N                  PDF scale factor
  --open                     open the PDF when done
  --cwd DIR                  working directory for execution
  --keep                     keep .nbx-tmp working folder
  --quiet                    less output
  --version, -v              version
  --help, -h                 this help
`);
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
const log = {
  info: (m) => { if (!log.quiet) console.log(m); },
  warn: (m) => console.warn(`⚠  ${m}`),
  err: (m) => console.error(`✖  ${m}`),
  quiet: false,
};

// ---------------------------------------------------------------------------
// .md master parser
//
// Cells are separated by a line of 3+ "=" characters. Each cell's first
// non-blank, non-"---" line may declare its type:
//     Cell: raw   |   Cell: code   |   Cell: markdown   (default: markdown)
// Raw cells are parsed for ::: directives.
// ---------------------------------------------------------------------------
const CELL_SEP = /^={3,}[ \t]*$/m;
const CELL_TYPE = /^Cell:\s*(raw|code|markdown|md)\s*$/i;

function parseMaster(src) {
  const rawBlocks = src
    .replace(/\r\n/g, '\n')
    .split(CELL_SEP)
    .map((b) => b.replace(/^\n+|\n+$/g, ''));

  const cells = [];
  for (const block of rawBlocks) {
    if (!block) continue;
    const lines = block.split('\n');
    // Skip a leading "---" (allow both marker styles) and leading blanks.
    while (lines.length && (lines[0].trim() === '' || /^---+$/.test(lines[0].trim()))) lines.shift();
    let type = 'markdown';
    const m = lines.length && lines[0].match(CELL_TYPE);
    if (m) { type = m[1] === 'md' ? 'markdown' : m[1]; lines.shift(); }
    const source = lines.join('\n').replace(/^\n+|\n+$/g, '');
    if (!source) continue;
    if (type === 'raw') {
      cells.push({ type: 'raw', source, directives: parseDirectives(source) });
    } else {
      cells.push({ type, source });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Directive parser
// A directive is a ::: block. Forms:
//   :::name<inner>                inline, single line
//   :::name{attrs}<inner>         inline with attributes
//   :::name                       fenced block; body ends at a lone ":::"
// Fenced blocks can span multiple cells in the source file but are merged here.
// Returns array of { name, inner, attrs, body, lines:[lineNo...] }
// ---------------------------------------------------------------------------
function parseDirectives(source) {
  const out = [];
  const lines = source.split('\n');
  let i = 0;
  const push = (name, inner, attrs, body, start) => {
    out.push({ name: name.toLowerCase(), inner, attrs, body, start });
  };
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line.startsWith(':::')) { i++; continue; }
    // Gather the directive into a single logical line (allow wrap on \ before >)
    let logical = line;
    while (logical.startsWith(':::') && !/\<[^]*>\s*$/.test(logical) && logical.trim().endsWith('\\')) {
      i++; logical = logical.slice(0, -1) + ' ' + (lines[i] || '').trim();
    }
    const body = lines[i].trim();
    if (!body.startsWith(':::')) { i++; continue; }
    const start = i;
    const open = body.replace(/^:::/, '').trim();
    // Leaf directives carry no body — treat a bare name as a leaf, not a fence.
    const LEAF = ['pagebreak', 'oddpage', 'evenpage', 'appendix', 'toc', 'break'];
    const nameOnly = open.match(/^([\w-]+)\s*(?:\{([^}]*)\})?\s*$/i);
    if (nameOnly && LEAF.includes(nameOnly[1].toLowerCase())) {
      push(nameOnly[1], null, nameOnly[2] || '', null, start); i++; continue;
    }
    // If it's a fence opener (no inline content), find the closing ":::"
    if (nameOnly) {
      const parts = open.match(/^([\w-]+)\s*(?:\{([^}]*)\})?$/i);
      const name = parts[1]; const attrs = parts[2] || '';
      i++;
      const bodyLines = [];
      while (i < lines.length && lines[i].trim() !== ':::') { bodyLines.push(lines[i]); i++; }
      i++; // consume closing ::: if present
      push(name, null, attrs, bodyLines.join('\n'), start);
      continue;
    }
    // Inline form: :::name{attrs}<inner>
    const m = open.match(/^([\w-]+)\s*(?:\{([^}]*)\})?\s*<([\s\S]*)>$/);
    if (m) { push(m[1], m[3], m[2] || '', null, start); i++; continue; }
    // Name only with no content
    const m2 = open.match(/^([\w-]+)$/);
    if (m2) { push(m2[1], null, '', null, start); i++; continue; }
    i++;
  }
  return out;
}

// Simple split helper for :::a<b> syntax used above
function parseDirectivesInline(s) { return parseDirectives(s); }

// ---------------------------------------------------------------------------
// Markdown -> HTML (compact, dependency-free renderer)
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
// Inline: **bold** *italic* `code` [text](url) ~~strike~~ $math$ ![alt](file.png)
let _mdBaseDir = null;
function setMdBaseDir(dir) { _mdBaseDir = dir; }
function inlineLocalImage(path) {
  // Resolve a local image path (relative to the .md source) and inline it as base64.
  try {
    const full = _mdBaseDir ? resolve(_mdBaseDir, path) : resolve(path);
    if (!existsSync(full)) return null;
    const buf = readFileSync(full);
    const ext = extname(full).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
}
function renderInline(text) {
  // escape, then apply simple token patterns
  let s = escapeHtml(text);
  // local images: ![caption](path) -> inlined <img> with a caption below
  s = s.replace(/!\[([^\]]*)\]\(([^)]+\.(?:png|jpe?g|gif|svg))\)/g, (_, alt, path) => {
    const data = inlineLocalImage(path);
    const imgSrc = data ? data : escapeAttr(path);
    const cap = alt.trim() ? `<div class="figure-caption">${escapeHtml(alt)}</div>` : '';
    return `<figure class="md-figure"><img src="${imgSrc}" alt="${escapeAttr(alt)}" class="md-img" />${cap}</figure>`;
  });
  s = s.replace(/\$\$([^$]+)\$\$/g, (_, m) => renderMath(m.trim(), true));
  s = s.replace(/\$([^$]+)\$/g, (_, m) => renderMath(m.trim(), false));
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code class="inline">${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}
function renderCodeBlocks(lines, i) {
  // lines[i] starts a ``` fence; returns [html, nextIndex]
  const lang = lines[i].match(/^```([\w+-]*)\s*$/)?.[1] || '';
  let body = [];
  let j = i + 1;
  while (j < lines.length && !/^```/.test(lines[j])) { body.push(lines[j]); j++; }
  const code = body.join('\n');
  return [`<pre class="codeblock"><div class="code-lang">${lang || 'code'}</div><code class="lang-${lang || 'txt'}">${highlight(code, lang)}</code></pre>`, j + 1];
}
function renderTable(lines, i) {
  const header = lines[i].split('|').map((c) => c.trim()).filter((c, idx, a) => !(idx === 0 && c === '') && !(idx === a.length - 1 && c === ''));
  let j = i + 1;
  // skip the separator row
  if (j < lines.length && /^[\s|:—\-]+$/.test(lines[j]) && lines[j].includes('-')) j++;
  const rows = [];
  while (j < lines.length && lines[j].trim().startsWith('|')) {
    const cells = lines[j].split('|').map((c) => c.trim()).filter((c, idx, a) => !(idx === 0 && c === '') && !(idx === a.length - 1 && c === ''));
    rows.push(cells.map((c) => `<td>${renderInline(c)}</td>`).join(''));
    j++;
  }
  const head = header.map((c) => `<th>${renderInline(c)}</th>`).join('');
  return [`<table class="md-table"><thead><tr>${head}</tr></thead><tbody>${rows.map((r) => `<tr>${r}</tr>`).join('')}</tbody></table>`, j];
}
function renderMarkdown(src) {
  const lines = src.replace(/\r/g, '').split('\n');
  const html = [];
  let i = 0;
  let listStack = [];
  const closeLists = (depth) => { while (listStack.length > depth) { html.push('</li></ul>'); listStack.pop(); } };
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') { i++; continue; }
    if (t.startsWith('```')) { const [h, ni] = renderCodeBlocks(lines, i); html.push(h); i = ni; continue; }
    if (/^\$\$/.test(t)) {
      const match = t.match(/^\$\$([\s\S]*)\$\$$/);
      if (match) { closeLists(0); html.push(`<div class="math-block">${renderMath(match[1].trim(), true)}</div>`); i++; continue; }
    }
    if (t.startsWith('|')) { const [h, ni] = renderTable(lines, i); html.push(h); i = ni; continue; }
    if (/^#{1,6}\s/.test(t)) {
      closeLists(0);
      const level = t.match(/^(#{1,6})\s/)[1].length;
      const headingId = t.replace(/^#{1,6}\s+/, '').replace(/[^\w]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
      html.push(`<h${level} id="${headingId}">${renderInline(t.replace(/^#{1,6}\s+/, ''))}</h${level}>`);
      i++; continue;
    }
    if (/^[-*+]\s/.test(t)) {
      const depth = 1;
      if (listStack.length < depth) { html.push('<ul>'); listStack.push(depth); }
      html.push(`<li>${renderInline(t.replace(/^[-*+]\s/, ''))}`);
      i++; continue;
    }
    if (/^\d+[.)]\s/.test(t)) {
      const depth = 1;
      if (listStack.length < depth) { html.push('<ol>'); listStack.push(depth); }
      html.push(`<li>${renderInline(t.replace(/^\d+[.)]\s/, ''))}`);
      i++; continue;
    }
    if (/^>+\s/.test(t)) {
      closeLists(0);
      html.push(`<blockquote>${renderInline(t.replace(/^>+\s?/, ''))}</blockquote>`);
      i++; continue;
    }
    if (/^---+$/.test(t)) { closeLists(0); html.push('<hr>'); i++; continue; }
    // paragraph: gather until blank line
    const para = [t];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|[-*+]\s|\d+[.)]\s|>\s|\||---+$)/.test(lines[i].trim())) { para.push(lines[i]); i++; }
    html.push(`<p>${renderInline(para.join(' '))}</p>`);
  }
  closeLists(0);
  return html.join('\n');
}

// ---------------------------------------------------------------------------
// LaTeX math via KaTeX (Node API, offline, no CDN)
// ---------------------------------------------------------------------------
import katex from 'katex';

let _katexCss = null;
async function initKatex() {
  if (!_katexCss) {
    _katexCss = await readFile(resolve(__dirname, 'node_modules/katex/dist/katex.min.css'), 'utf8');
  }
  return _katexCss;
}
function renderMath(tex, displayMode) {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false });
  } catch (e) {
    return `<span class="math-error">${escapeHtml(tex)}</span>`;
  }
}

// Python syntax highlighting via Shiki (Node API, offline, no CDN)
// ---------------------------------------------------------------------------
import { createHighlighter } from 'shiki';

let _hl = null;
async function initHighlighter() {
  if (!_hl) {
    _hl = await createHighlighter({ themes: ['rose-pine-dawn'], langs: ['python'] });
  }
  return _hl;
}
function highlight(code, lang) {
  try {
    if (!_hl) return escapeHtml(code);
    const html = _hl.codeToHtml(code, { lang: 'python', theme: 'rose-pine-dawn' });
    // Shiki returns <pre class="shiki"><code>...</code></pre>; keep only inner <code> so our .codeblock wrapper stays valid.
    const m = html.match(/<code[^>]*>([\s\S]*)<\/code>/);
    return m ? m[1] : escapeHtml(code);
  } catch (e) {
    return escapeHtml(code);
  }
}

// ---------------------------------------------------------------------------
// Notebook execution via jupyter nbconvert (into a temp copy)
// ---------------------------------------------------------------------------
async function executeNotebook(ipynbPath, cwd) {
  const tmpDir = join(cwd, '.nbx-tmp');
  const tmp = join(tmpDir, basename(ipynbPath));
  await mkdir(tmpDir, { recursive: true });
  await copyFile(ipynbPath, tmp);
  // Copy sibling data files into the temp dir so cells that read "data.csv",
  // "heart.csv", etc. still work regardless of the kernel's working directory.
  const all = await readdir(cwd).catch(() => []);
  for (const f of all) {
    if (/\.(csv|json|txt|xlsx|parquet|tsv)$/i.test(f)) {
      await copyFile(join(cwd, f), join(tmpDir, f)).catch(() => {});
    }
  }
  const python = process.env.NBX_PYTHON || 'python';
  execFileSync(python, [
    '-m', 'nbconvert', '--execute', '--to', 'notebook', '--output', basename(ipynbPath), '--ExecutePreprocessor.timeout=300', tmp
  ], { cwd: tmpDir, stdio: 'pipe' });
  // nbconvert writes <output> into tmp dir
  const executedPath = join(cwd, '.nbx-tmp', basename(ipynbPath));
  const nb = JSON.parse(await readFile(executedPath, 'utf8'));
  return nb;
}

// Convert an ipynb file to cells in the internal format
async function loadNotebook(ipynbPath, cwd) {
  const nb = JSON.parse(await readFile(ipynbPath, 'utf8'));
  return nb.cells.map((c) => {
    if (c.cell_type === 'markdown') return { type: 'markdown', source: (c.source || []).join('') };
    if (c.cell_type === 'raw') return { type: 'raw', source: (c.source || []).join(''), directives: parseDirectives((c.source || []).join('')) };
    return { type: 'code', source: (c.source || []).join(''), outputs: c.outputs || [] };
  });
}

// ---------------------------------------------------------------------------
// Output -> HTML (richest representation wins)
// ---------------------------------------------------------------------------
function renderOutputs(outputs, execCount) {
  const mime = (m) => Array.isArray(m) ? m.join('') : (m || '');
  let html = '';
  for (const o of outputs || []) {
    const data = o.data || {};
    if (o.output_type === 'error') {
      html += `<div class="cell-error"><strong>Error</strong> ${escapeHtml(o.ename || '')}: ${escapeHtml(o.evalue || '')}</div>`;
      continue;
    }
    if (o.output_type === 'stream') {
      html += `<div class="out-block"><div class="out-label">Output</div><pre class="stdout">${escapeHtml(mime(o.text))}</pre></div>`;
      continue;
    }
    // display_data / execute_result
    if (data['image/png']) {
      html += `<div class="cell-figure"><img src="data:image/png;base64,${mime(data['image/png'])}" /></div>`;
    } else if (data['text/html']) {
      html += `<div class="cell-html">${mime(data['text/html'])}</div>`;
    } else if (data['text/plain']) {
      html += `<div class="out-block"><div class="out-label">Output</div><pre class="stdout">${escapeHtml(mime(data['text/plain']))}</pre></div>`;
    }
  }
  return html;
}

// ---------------------------------------------------------------------------
// Directive -> HTML
// ---------------------------------------------------------------------------
function directiveHtml(d) {
  const inner = d.inner || '';
  const body = d.body || '';
  const idAttr = d.attrs ? ` id="${escapeAttr(d.attrs)}"` : '';
  switch (d.name) {
    case 'title': return `<div class="cover-title"${idAttr}>${escapeHtml(inner)}</div>`;
    case 'subtitle': return `<div class="cover-subtitle"${idAttr}>${escapeHtml(inner)}</div>`;
    case 'date': return `<div class="cover-date"${idAttr}>${escapeHtml(inner)}</div>`;
    case 'meta': {
      const [k, v] = inner.split('::').map((s) => s.trim());
      return `<div class="cover-meta"${idAttr}><span>${escapeHtml(k)}</span><span>${escapeHtml(v || '')}</span></div>`;
    }
    case 'index': return `<section class="index-page"${idAttr}><h1>${escapeHtml(inner || 'Index')}</h1><div class="index-body"></div></section>`;
    case 'section': return `<h2 class="section-h"${idAttr}>${renderInline(inner)}</h2>`;
    case 'question': return `<div class="callout question"${idAttr}><span class="callout-label">Question</span>${inner ? `<div class="callout-body">${renderMarkdown(inner)}</div>` : `<div class="callout-body">${renderMarkdown(body)}</div>`}</div>`;
    case 'answer': return `<div class="callout answer"${idAttr}><span class="callout-label">Answer</span>${inner ? `<div class="callout-body">${renderMarkdown(inner)}</div>` : `<div class="callout-body">${renderMarkdown(body)}</div>`}</div>`;
    case 'note': return `<div class="callout note"${idAttr}><span class="callout-label">Note</span><div class="callout-body">${renderMarkdown(inner || body)}</div></div>`;
    case 'tip': return `<div class="callout tip"${idAttr}><span class="callout-label">Tip</span><div class="callout-body">${renderMarkdown(inner || body)}</div></div>`;
    case 'warning': return `<div class="callout warning"${idAttr}><span class="callout-label">Warning</span><div class="callout-body">${renderMarkdown(inner || body)}</div></div>`;
    case 'keypoint': return `<div class="callout keypoint"${idAttr}><span class="callout-label">Key Point</span><div class="callout-body">${renderMarkdown(inner || body)}</div></div>`;
    case 'observation': return `<li class="observation"${idAttr}>${renderMarkdown(inner || body)}</li>`;
    case 'result': {
      if (inner.includes('::')) { const [k, v] = inner.split('::').map((s) => s.trim()); return `<div class="result-line"${idAttr}><span class="result-key">${escapeHtml(k)}</span><span class="result-val">${escapeHtml(v)}</span></div>`; }
      return `<div class="result-line"${idAttr}><span class="result-key">${escapeHtml(inner || body)}</span></div>`;
    }
    case 'metric': {
      const parts = inner.split('|').map((s) => s.trim());
      let tiles = '';
      for (let x = 0; x < parts.length; x += 2) tiles += `<div class="metric-tile"><div class="metric-key">${escapeHtml(parts[x])}</div><div class="metric-val">${escapeHtml(parts[x + 1] || '')}</div></div>`;
      return `<div class="metric-strip"${idAttr}>${tiles}</div>`;
    }
    case 'figure': return `<div class="figure-caption"${idAttr}>${escapeHtml(inner || body)}</div>`;
    case 'code': return `<div class="code-caption"${idAttr}>${escapeHtml(inner || 'Code')}</div>`;
    case 'output': return `<div class="output-caption"${idAttr}>${escapeHtml(inner || 'Output')}</div>`;
    case 'pagebreak': return `<div class="page-break"></div>`;
    case 'oddpage': return `<div class="odd-page-break"></div>`;
    case 'evenpage': return `<div class="even-page-break"></div>`;
    case 'appendix': return `<div class="appendix-break"></div>`;
    case 'toc': return `<section class="toc-page"><h1>${escapeHtml(inner || 'Index')}</h1><div class="toc-body"></div></section>`;
    default: return `<div class="directive-unknown"${idAttr}>:::${escapeHtml(d.name)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// CSS design system
// Times New Roman body 12pt justified; headings 14pt bold; print-ready.
// ---------------------------------------------------------------------------
const THEMES = {
  academic: {
    accent: '#1f4e79', accent2: '#2e75b6', bg: '#ffffff', fg: '#1a1a1a',
    muted: '#5a5a5a', rule: '#c9c9c9', codebg: '#f4f4f4',
    font: '"Times New Roman", Times, serif', mono: '"Cascadia Mono", Consolas, monospace',
  },
  modern: {
    accent: '#0f6cbd', accent2: '#0e8a6d', bg: '#ffffff', fg: '#0f172a',
    muted: '#526073', rule: '#e2e8f0', codebg: '#f1f5f9',
    font: 'Segoe UI, system-ui, sans-serif', mono: '"Cascadia Mono", Consolas, monospace',
  },
  plain: {
    accent: '#111111', accent2: '#444444', bg: '#ffffff', fg: '#111111',
    muted: '#444444', rule: '#bbbbbb', codebg: '#f5f5f5',
    font: '"Times New Roman", Times, serif', mono: 'Consolas, monospace',
  },
};

function cssFor(themeName) {
  const t = THEMES[themeName] || THEMES.plain;
  return `
:root{
  --accent:${t.accent};--accent2:${t.accent2};--bg:${t.bg};--fg:${t.fg};
  --muted:${t.muted};--rule:${t.rule};--codebg:${t.codebg};
  --font:${t.font};--mono:${t.mono};
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:var(--font);font-size:12pt;color:var(--fg);background:var(--bg);line-height:1.55}
p{text-align:justify;margin:0.5em 0}
h1,h2,h3,h4{color:#111;font-weight:bold;page-break-after:avoid;orphans:3;widows:3}
h1{font-size:14pt;margin-top:0.6em}
h2{font-size:14pt;margin-top:1.2em}
h3{font-size:13pt;margin-top:1em}
h4{font-size:12pt;margin-top:0.8em}
a{color:var(--accent);text-decoration:none}
strong{font-weight:bold}
em{font-style:italic}
hr{border:0;border-top:1px solid var(--rule);margin:1em 0}
blockquote{border-left:3px solid var(--accent2);margin:0.6em 0;padding:0.2em 1em;color:var(--muted);background:#fafafa}
code.inline{font-family:var(--mono);font-size:0.9em;background:var(--codebg);padding:0.05em 0.3em;border-radius:3px;color:var(--accent)}
pre.stdout{font-family:var(--mono);font-size:11pt;background:var(--codebg);padding:0.6em 0.8em;border:1px solid var(--rule);border-radius:4px;white-space:pre-wrap;overflow-wrap:anywhere;margin:0.2em 0 0.4em;page-break-inside:auto;page-break-after:auto}
.out-block{margin:0.4em 0}
.out-label{font-family:var(--mono);font-size:8pt;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:0.15em;font-weight:bold}
.out-block .stdout{margin:0}
pre.codeblock{font-family:var(--mono);font-size:10pt;background:var(--codebg);border:1px solid var(--rule);border-radius:4px;padding:0.9em 1em;position:relative;page-break-inside:auto;white-space:pre-wrap;overflow-wrap:anywhere}
pre.codeblock code{font-family:inherit;font-size:inherit;line-height:1.45}
ol.observations{margin:0.5em 0 0.5em 1.4em;padding-left:0}
ol.observations li{margin:0.2em 0;text-align:justify}
ol.observations .observation{list-style:decimal}
.cell-figure{text-align:center;margin:0.6em 0;page-break-inside:avoid}
.cell-figure img{max-width:100%;height:auto;display:inline-block}
.md-img{max-width:100%;height:auto;display:block;margin:0.6em auto;page-break-inside:avoid}
.md-figure{text-align:center;margin:0.6em 0;page-break-inside:avoid}
.md-figure .figure-caption{font-size:10.5pt;color:var(--muted);font-style:italic;margin-top:0.3em}
.math-block{text-align:center;margin:0.8em 0;overflow-x:auto;page-break-inside:avoid}
.math-error{color:#a00;font-family:var(--mono);font-size:10pt}
.cell-html{overflow-x:auto;margin:0.4em 0;page-break-inside:auto}
.cell-error{font-family:var(--mono);font-size:9pt;color:#a00;background:#fde;border:1px solid #f88;border-left:3px solid #c00;padding:0.6em;border-radius:4px;margin:0.4em 0}
table.md-table,table.dataframe{border-collapse:collapse;margin:0.6em 0;font-size:11pt;page-break-inside:auto;border:1px solid #333}
table.md-table tr,table.dataframe tr{page-break-inside:avoid}
table.md-table th,table.md-table td,table.dataframe th,table.dataframe td{border:1px solid #555;padding:0.3em 0.7em;text-align:left !important}
table.md-table thead,table.dataframe thead th{background:#eee;color:#111;font-weight:bold;text-align:left !important}
table.md-table thead tr,table.dataframe thead tr{background:#eee !important}
table.dataframe tbody th{background:#fff;color:#111;font-weight:normal;text-align:left !important}
table.md-table tbody tr:nth-child(even),table.dataframe tbody tr:nth-child(even){background:#f5f5f5}
table.md-table *,table.dataframe *{text-align:left !important}
/* cover */
.cover{text-align:center;padding:4em 1em 2em;page-break-after:always}
.cover-title{font-size:16pt;font-weight:bold;color:var(--accent);margin:2em 0 0.3em}
.cover-subtitle{font-size:14pt;font-weight:bold;color:var(--accent2);margin:0 0 1.5em}
.cover-date{font-size:12pt;color:var(--muted);margin-bottom:2em}
.cover-meta{display:flex;justify-content:space-between;max-width:440px;margin:0.35em auto;border-bottom:1px dotted var(--rule);padding:0.2em 0;font-size:12pt}
.cover-meta span:first-child{color:var(--muted)}
.cover-meta span:last-child{font-weight:bold}
/* index / toc */
.index-page,.toc-page{page-break-after:always}
.index-page h1,.toc-page h1{font-size:14pt;color:var(--accent);border-bottom:1px solid var(--rule);padding-bottom:0.2em}
.index-body,.toc-body{margin-top:1em}
.toc-entry{display:flex;justify-content:space-between;border-bottom:1px dotted var(--rule);padding:0.25em 0;color:var(--fg)}
.toc-entry a{color:var(--fg)}
.toc-entry .toc-page-no{color:var(--muted)}
/* callouts */
.callout{border-radius:0;padding:0.3em 0;margin:0.5em 0;border:0;border-bottom:1px solid var(--rule);page-break-inside:avoid}
.callout .callout-label{font-weight:bold;text-transform:uppercase;font-size:8.5pt;letter-spacing:0.06em;display:block;margin-bottom:0.1em;color:var(--muted)}
.callout .callout-body p{margin:0.2em 0}
.callout.question .callout-label,.callout.answer .callout-label,
.callout.note .callout-label,.callout.tip .callout-label,
.callout.warning .callout-label,.callout.keypoint .callout-label,
.callout.observation .callout-label{color:var(--fg)}
.callout.question,.callout.answer,.callout.note,.callout.tip,
.callout.warning,.callout.keypoint,.callout.observation{background:transparent;border-color:var(--rule)}
/* results & metrics */
.result-line{font-family:var(--mono);font-size:10pt;display:flex;justify-content:space-between;border-bottom:1px dotted var(--rule);padding:0.2em 0;max-width:560px}
.result-key{color:var(--muted)}
.result-val{font-weight:bold;color:var(--accent)}
.metric-strip{display:flex;gap:0.5em;flex-wrap:wrap;margin:0.6em 0;page-break-inside:avoid}
.metric-tile{flex:1 1 120px;border:1px solid var(--rule);border-top:3px solid var(--accent);border-radius:4px;padding:0.4em 0.6em;text-align:center;background:var(--bg)}
.metric-key{font-size:8.5pt;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em}
.metric-val{font-size:13pt;font-weight:bold;color:var(--accent);font-family:var(--mono)}
.figure-caption,.code-caption,.output-caption{text-align:center;font-size:10.5pt;color:var(--muted);font-style:italic;margin:0.3em 0 0.8em;font-family:var(--mono);page-break-after:avoid}
.page-break{page-break-after:always}
.odd-page-break{page-break-after:always;break-after:page}
.appendix-break{page-break-before:always}
.directive-unknown{font-family:var(--mono);color:#a00;background:#ffe;padding:0.2em 0.5em;border:1px dashed #f88}
@page{size:A4;margin:2.4cm 2.2cm 2.2cm 2.2cm}
@media print{
  .cover{page-break-after:always}
  .index-page{page-break-after:always}
}`;
}

// ---------------------------------------------------------------------------
// HTML document builder
// ---------------------------------------------------------------------------
async function buildHtml(cells, meta, themeName) {
  const css = cssFor(themeName);
  let katexCss = '';
  try { katexCss = await initKatex(); } catch (e) { /* katex css unavailable */ }
  const body = [];
  let execCounter = 0;
  let obsOpen = false;
  const closeObs = () => { if (obsOpen) { body.push('</ol>'); obsOpen = false; } };
  const push = (html) => { closeObs(); body.push(html); };
  for (const c of cells) {
    if (c.type === 'raw') {
      for (const d of c.directives) {
        if (d.name === 'observation') {
          if (!obsOpen) { body.push('<ol class="observations">'); obsOpen = true; }
          body.push(directiveHtml(d));
        } else {
          closeObs();
          body.push(directiveHtml(d));
        }
      }
    } else if (c.type === 'markdown') {
      closeObs();
      body.push(`<div class="md-cell">${renderMarkdown(c.source)}</div>`);
    } else {
      // code cell
      closeObs();
      execCounter++;
      body.push(`<div class="code-cell">${renderCodeCell(c)}</div>`);
      const out = renderOutputs(c.outputs || [], execCounter);
      if (out) body.push(`<div class="out-cell">${out}</div>`);
    }
  }
  closeObs();
  const title = meta.title || 'Report';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${css}\n${katexCss}</style>
</head>
<body>
${body.join('\n')}
</body>
</html>`;
}

function renderCodeCell(c) {
  return `<pre class="codeblock"><code class="lang-python">${highlight(c.source, 'python')}</code></pre>`;
}

// ---------------------------------------------------------------------------
// Raw-mode markdown exporter (if --md)
// ---------------------------------------------------------------------------
function toMarkdown(cells) {
  const out = [];
  for (const c of cells) {
    if (c.type === 'raw') {
      out.push(`---\nCell: raw\n${c.source}\n=====`);
    } else if (c.type === 'markdown') {
      out.push(`---\nCell: markdown\n${c.source}\n=====`);
    } else {
      out.push(`---\nCell: code\n${c.source}\n=====`);
    }
  }
  return out.join('\n\n');
}

// ---------------------------------------------------------------------------
// PDF rendering via playwright-core + system Edge/Chrome
// ---------------------------------------------------------------------------
function detectBrowserPath() {
  const candidates = [
    process.env.NBX_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

async function renderPdf(html, pdfPath, opts) {
  const { chromium } = require('playwright-core');
  const browserPath = detectBrowserPath();
  if (!browserPath) {
    log.err('No browser found. Set NBX_BROWSER to a Chrome/Edge/Chromium executable.');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const marginByLvl = { minimal: '0.2cm', low: '0.6cm', mid: '1.2cm', normal: '1.8cm', high: '2.4cm' };
  const margin = marginByLvl[opts.margins] || marginByLvl.normal;
  await page.pdf({
    path: pdfPath, format: 'A4', printBackground: true,
    scale: opts.scale || 1,
    margin: { top: margin, right: margin, bottom: margin, left: margin },
    displayHeaderFooter: true,
    footerTemplate: '<span></span>',
    headerTemplate: '<span></span>',
  });
  await browser.close();
}

async function mergePdfs(pdfPaths, outPath) {
  const { PDFDocument } = require('pdf-lib');
  const merged = await PDFDocument.create();
  for (const p of pdfPaths) {
    const src = await PDFDocument.load(await readFile(p));
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => merged.addPage(pg));
  }
  await writeFile(outPath, await merged.save());
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { opts, files } = parseArgs(process.argv.slice(2));
  log.quiet = opts.quiet;

  let sources = files;
  if (opts.cwd !== process.cwd()) process.chdir(opts.cwd);
  const cwd = process.cwd();

  if (sources.length === 0) {
    // default: find lab*/ folders with *.md or scan cwd for *.md
    const all = await readdir(cwd);
    sources = all.filter((e) => /^lab\d+$/i.test(e)).map((e) => e);
    if (sources.length === 0) {
      sources = all.filter((e) => e.endsWith('.md'));
    }
  }
  if (sources.length === 0) { log.err('No .md master files found.'); process.exit(1); }

  const producedPdfs = [];
  for (const src of sources) {
    const srcPath = src.includes('/') || src.includes('\\') ? src : resolve(cwd, src);
    if (!existsSync(srcPath)) { log.warn(`Skipping (not found): ${src}`); continue; }
    const stat = await (async () => { try { return (await import('fs')).statSync(srcPath); } catch { return null; } })();
    if (stat && stat.isDirectory()) {
      const inner = (await readdir(srcPath)).filter((f) => f.endsWith('.md'));
      for (const f of inner) await buildOne(resolve(srcPath, f), opts, producedPdfs);
    } else {
      await buildOne(srcPath, opts, producedPdfs);
    }
  }
  if (producedPdfs.length > 1 && opts.merge) {
    const out = resolve(cwd, (opts.output || 'combined') + '.pdf');
    await mergePdfs(producedPdfs, out);
    log.info(`Merged ${producedPdfs.length} PDFs -> ${out}`);
  }
}

async function buildOne(srcPath, opts, producedPdfs) {
  const base = basename(srcPath, extname(srcPath));
  const outBase = opts.output || base;
  const dir = dirname(srcPath);
  log.info(`\n▸ ${srcPath}`);

  // 1. parse master
  const masterSrc = await readFile(srcPath, 'utf8');
  const cells = parseMaster(masterSrc);

  // extract meta for title
  const meta = {};
  for (const c of cells) if (c.type === 'raw') for (const d of c.directives) {
    if (d.name === 'title') meta.title = d.inner;
    if (d.name === 'subtitle' && !meta.subtitle) meta.subtitle = d.inner;
  }

  // 2. build ipynb
  const nb = cellsToNotebook(cells);
  const ipynbPath = join(dir, outBase + '.ipynb');
  await writeFile(ipynbPath, JSON.stringify(nb, null, 1));
  if (opts.ipynb) log.info(`  ipynb -> ${ipynbPath}`);

  // 3. execute (into temp copy) to obtain outputs
  let execCells = cells;
  if (opts.execute) {
    try {
      const nb = await executeNotebook(ipynbPath, dir);
      await writeFile(ipynbPath, JSON.stringify(nb, null, 1));
      log.info(`  executed -> ${ipynbPath}`);
      execCells = nb.cells.map((c) => {
        if (c.cell_type === 'markdown') return { type: 'markdown', source: (c.source || []).join('') };
        if (c.cell_type === 'raw') return { type: 'raw', source: (c.source || []).join(''), directives: parseDirectives((c.source || []).join('')) };
        return { type: 'code', source: (c.source || []).join(''), outputs: c.outputs || [] };
      });
      log.info('  executed (fresh outputs)');
    } catch (e) {
      log.warn('Execution failed; using saved outputs. ' + e.message);
    }
  }

  // 4. build HTML
  await initHighlighter();
  setMdBaseDir(dir);
  const html = await buildHtml(execCells, meta, opts.theme);
  const htmlPath = join(dir, outBase + '.html');
  await writeFile(htmlPath, html);
  if (opts.html) log.info(`  html -> ${htmlPath}`);

  // 5. raw-mode markdown
  if (opts.md || opts.raw) {
    const mdPath = join(dir, outBase + '.md');
    await writeFile(mdPath, toMarkdown(execCells));
    log.info(`  md   -> ${mdPath}`);
  }

  // 6. PDF
  if (opts.pdf) {
    const pdfPath = join(dir, outBase + '.pdf');
    await renderPdf(html, pdfPath, opts);
    producedPdfs.push(pdfPath);
    log.info(`  pdf  -> ${pdfPath}`);
  }

  // cleanup temp
  if (!opts.keep) await rm(join(dir, '.nbx-tmp'), { recursive: true, force: true });
}

function cellsToNotebook(cells) {
  const nbCells = cells.map((c) => {
    if (c.type === 'raw') return { cell_type: 'raw', metadata: {}, source: c.source };
    if (c.type === 'markdown') return { cell_type: 'markdown', metadata: {}, source: c.source };
    return { cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: c.source };
  });
  return {
    nbformat: 4, nbformat_minor: 5,
    metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python', version: '3.13.14' } },
    cells: nbCells,
  };
}

export {
  VERSION, parseArgs, printHelp, log,
  parseMaster, parseDirectives, renderMarkdown, highlight,
  executeNotebook, loadNotebook, renderOutputs, directiveHtml,
  cssFor, buildHtml, toMarkdown, renderPdf, mergePdfs, cellsToNotebook, setMdBaseDir,
};

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => { console.error(e); process.exit(1); });
}