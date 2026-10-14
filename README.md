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
nbx lab1.md --no-pdf --no-ipynb  # → html only
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

A master file is plain Markdown. Separate cells with a line of **three-or-more `=`**.
A cell's type can be set with a leading line (no `---` marker needed):

```text
Cell: code       executable Python
Cell: markdown   prose (default if omitted)
Cell: raw        directives (optional)
```

Write **headings, paragraphs, lists, tables, and bold/italic** with plain Markdown.
Headings carry the numbers themselves. Use a clear **heading hierarchy**: `##` for each
major task (for example `## 3.1`) and `###` for each sub-step (for example `### 3.1.1`):

```markdown
=====
Cell: markdown
# Practical 1 - Detect Missing Values

**Objective:** detect and handle missing values in a dataset.
=====
Cell: markdown
## 1.1 Check Missing Values
=====
Cell: code
import pandas as pd
import seaborn as sns
df = sns.load_dataset('titanic')
print(df.isnull().sum())
=====
Cell: markdown
## Observations

1. `age` has 177 nulls; `deck` has 688.
2. Imputation is preferred over dropping rows.
```

Keep prose minimal. Most steps need only the heading and the code; add a short
**one-line** note only where a step genuinely benefits from one, and use brief
**one-line comments inside code** to explain what the cell does. Save the fuller
write-up for the Observations section.

## Optional directives (in raw cells)

`:::name<text>` inline or fenced (`:::name ... :::`):

| Directive | Purpose |
|---|---|
| `:::title` / `:::subtitle` / `:::date` / `:::meta<K :: V>` | Cover page |
| `:::index` / `:::toc` | Table of contents (index page) |
| `:::section` | Section heading |
| `:::question` / `:::answer` | Q&A blocks |
| `:::note` / `:::tip` / `:::warning` / `:::keypoint` / `:::observation` | Callouts |
| `:::figure` | Caption for an image/output |
| `:::metric<K\|V\|...>` | KPI tiles |
| `:::result<K :: V>` | Result line |
| `:::pagebreak` / `:::oddpage` / `:::appendix` | Page flow |

For simple practicals, **plain Markdown is enough** — directives are optional.

## Recommended structure per practical

```text
Practical title (h1) -> Task sections (## 3.1, ## 3.2, ...) -> Sub-steps (### 3.1.1, ...) -> Observations
```

Numbered sub-headings (1.1, 1.2, ...) map to the required tasks. Keep Observations as
the final section — it doubles as the conclusion.

## Workflow

```bash
npx github:glitchoff/nbx lab1.md      # -> lab1.ipynb + lab1.html + lab1.pdf
npx github:glitchoff/nbx lab1.md --open   # open the PDF
```

- No install needed — run it straight from GitHub with `npx`.
- Edit `lab1.md` in any editor (or GitHub), then re-run the command.
- Notebooks execute into a temp copy; your source is never mutated.
- Output in the PDF is genuinely computed, never hardcoded.

## Environment

You only need these on your machine (no `npm install` required by you):

- Node >= 18
- `jupyter nbconvert` (runs the code cells)
- Chrome or Edge (the print engine)

That's it. `npx github:glitchoff/nbx` fetches and runs the tool for you. If your browser
isn't auto-detected, set `NBX_BROWSER` to the full path of a Chrome/Edge executable.

### Optional: install locally instead of `npx`

Prefer a stable local install? Clone the repo and link it once:

```bash
git clone https://github.com/glitchoff/nbx.git
cd nbx
npm install
npm link          # exposes the `nbx` command; reload your shell after
```

Then use `nbx` instead of `npx github:glitchoff/nbx`.

## Common problems

| Symptom | Fix |
|---|---|
| `ModuleNotFoundError` in a cell | Install the package, e.g. `pip install scikit-learn` |
| Figures are black boxes | Save figures with `facecolor='white'` |
| `npx` says no internet / can't fetch | Retry, or clone the repo and run `node nbx.mjs` |

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
