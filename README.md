# nbx

**Convert `.md` master-source notebooks into clean `.ipynb`, `.html`, `.md` and `.pdf` reports.**

`nbx` is a single-file CLI that treats a plain Markdown file as the single source of
truth for a data-science practical, executes it, and renders it as a designed,
print-ready report. It replaces the default (ugly) `nbconvert`→PDF pipeline with one
that produces a real report: cover page, index, headings, callouts, captioned figures,
page numbers, and proper typography.

```
lab1.md  ──►  lab1.ipynb   (clean, executed notebook)
        ──►  lab1.html    (standalone designed report)
        ──►  lab1.pdf     (A4, Times New Roman, page numbers)
        ──►  lab1.md      (raw-mode re-render, optional)
```

## Requirements

- **Node.js ≥ 18**
- **Jupyter** (`pip install jupyter`) — used to execute cells
- **Chrome or Edge** installed (auto-detected) — used to print the PDF.
  Override with the `NBX_BROWSER` environment variable.

## Install

**Use it directly from GitHub — no install:**

```bash
npx github:glitchoff/nbx lab1.md
```

Only two dependencies are fetched (`playwright-core`, `pdf-lib`); `npx` handles it.

**Optional: stable local install**

```bash
git clone https://github.com/glitchoff/nbx.git
cd nbx
npm install
npm link          # exposes the `nbx` command globally; reload your shell
```

## Usage

The examples below use `nbx` (after a local install). Without installing, replace
`nbx` with `npx github:glitchoff/nbx` in any command.

```bash
nbx lab1.md                    # → lab1.ipynb, lab1.html, lab1.pdf
nbx lab1.md --no-pdf --no-ipynb# → html only
nbx lab1.md --md               # also write the raw-mode .md render
nbx .                          # every *.md in the cwd
nbx lab1 lab2 lab7             # every *.md in those folders, then merge PDFs
nbx *.md --merge --output report   # merge all into one PDF
nbx lab1.md --no-execute       # skip execution, use saved outputs
nbx lab1.md --theme modern --margins high --scale 0.9
```

### Flags

| Flag | Effect |
|---|---|
| `--execute` / `--no-execute` | Run cells (default: execute) |
| `--pdf` / `--no-pdf` | Emit PDF (default: yes) |
| `--html` / `--no-html` | Emit HTML (default: yes) |
| `--ipynb` / `--no-ipynb` | Emit `.ipynb` (default: yes) |
| `--md` / `--raw` | Also emit raw-mode `.md` render |
| `--merge` / `--no-merge` | Merge multi-file PDFs into one |
| `--output NAME` | Output base name (default: source base) |
| `--theme NAME` | `academic` (default), `modern`, `plain` |
| `--margins LVL` | `minimal, low, mid, normal, high` |
| `--scale N` | PDF scale factor |
| `--open` | Open the PDF when done |
| `--cwd DIR` | Working directory for execution |
| `--keep` | Keep `.nbx-tmp/` working folder |
| `--quiet` | Less output |
| `--version`, `-v` / `--help`, `-h` | Version / help |

---

## The `.md` master format

A master file is plain Markdown. Cells are separated by a line of **three-or-more
`=`** characters. Each cell may declare its type with a leading line:

```
Cell: raw        # directives live here (see below)
Cell: code       # executable Python
Cell: markdown   # prose (default if the marker is omitted)
```

### Example

````markdown
---
Cell: raw
:::
:::title<DATA SCIENCE PRACTICAL FILE>
:::subtitle<PRACTICAL 1 — DETECT MISSING VALUES>
:::date<Date of Conduct :: October 2026>
:::meta<Course Code :: CS123>
:::meta<Roll Number :: 21CS001>
:::
=====
---
Cell: raw
:::index<INDEX>
=====
---
Cell: markdown
## Objective

Detect and handle missing values in the Titanic dataset.
=====
---
Cell: code
import pandas as pd
import seaborn as sns
df = sns.load_dataset('titanic')
print(df.isnull().sum())
=====
---
Cell: raw
:::section<1. CHECK MISSING VALUES>
:::observation<`age` has 177 nulls; `deck` has 688.>
:::
````

> The leading `---` line is optional. A bare separator (`=====`) ends a cell.

## Directives

Directives are written in **raw cells** using `:::` fences. Two forms:

- **Inline:** `:::note<text>`
- **Fenced:** opens with `:::name`, body lines follow, closed with `:::`

Both are shown above. Attributes are allowed: `:::question{#q2 .wide}` (currently used
as an HTML `id`).

| Directive | Renders as |
|---|---|
| `:::title<...>` | Cover title |
| `:::subtitle<...>` | Cover subtitle |
| `:::date<...>` | Cover date line |
| `:::meta<Key :: Value>` | Cover metadata row (repeatable) |
| `:::index<...>` / `:::toc<...>` | Index / table-of-contents page |
| `:::section<...>` | Section heading (also `h1`–`h6`) |
| `:::question<...>` | Numbered question card |
| `:::answer` | Tinted answer block |
| `:::note<...>` | Blue callout — neutral info |
| `:::tip<...>` | Green callout — a trick |
| `:::warning<...>` | Amber callout — a caveat |
| `:::keypoint<...>` | Highlighted "so what" box |
| `:::observation<...>` | Observations block |
| `:::figure<caption>` | Figure caption (place before/after an image) |
| `:::code<caption>` | Code caption |
| `:::output<caption>` | Output caption |
| `:::metric<K1 \| V1 \| K2 \| V2>` | Row of KPI tiles |
| `:::result<Key :: Value>` | Monospace result line |
| `:::pagebreak` | Force a page break |
| `:::oddpage` | Break to the next odd page |
| `:::evenpage` | Break to the next even page |
| `:::appendix` | Start the appendix (break before) |

## Notes

- Notebooks are executed into a temp copy (`.nbx-tmp/`) — **your source files are never
  mutated**.
- Output is taken from the *richest* representation available: `image/png`,
  `text/html` (DataFrames render as real tables), then `text/plain`.
- Because Chromium can't compute cross-reference page numbers, the index lists sections
  but cannot print per-entry page numbers.
- The design system lives entirely in `nbx.mjs` (`cssFor`), so themes are just tokens.

## License

MIT