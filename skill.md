---
name: nbx
description: Author data-science practical files as a single .md master source and render them as submission-ready PDF/HTML/ipynb reports with the required formatting rules (Times New Roman, justified, page numbers).
---

# nbx — skill

For **you and your peers**: use `nbx` to author a data-science practical as one readable
Markdown file and render it into a PDF report that already satisfies the submission
formatting rules. You write plain Markdown; `nbx` adds the required styling.

## The formatting rules this skill encodes

These are the **File Preparation Guidelines** for a practical submission:

Each practical should consist of the following sections:

- Major Practical Title
- Date
- Practical Title
- Input/Code
- Description
- Output
- Observations

Notes:

1. The file should be formatted in **Times New Roman** throughout.
2. Font Size should be **14 for the Heading only**, and the text should be **Bold**.
3. Font Size should be **12 for the file content**.
4. The content should be properly **justified** (CTRL+J).
5. Images should be **labelled with a suitable caption** (identifying the function).
6. Footer should comprise of **Course Code, Roll number and Page number**.
7. The **INDEX page should start from an Odd Page Number**.
8. The **page numbers should start from the INDEX page**.
9. **Practical 1 should also start from an Odd Page Number.**

`nbx` handles the typography and layout. You write the content.

## How to write a practical (the .md master)

Separate cells with a line of **three-or-more `=`**. A cell's type is a leading line
(no `---` marker needed):

```
Cell: code       executable Python
Cell: markdown   prose (default if omitted)
Cell: raw        directives (optional)
```

Write **headings, paragraphs, lists, tables and bold/italic with plain Markdown**.
Headings carry the numbers themselves. Use a clear **heading hierarchy**: `##` for each
major task (e.g. `## 3.1`) and `###` for each sub-step (e.g. `### 3.1.1`):

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

```
Practical title (h1)  ->  Task sections (## 3.1, ## 3.2, ...)  ->  Sub-steps (### 3.1.1, ...)  ->  Observations
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

If your Python environment is missing required packages (or you prefer an isolated
environment) and you have Conda installed, create and use a Conda environment. Example:

```bash
conda create -n nbx python=3.10 -y
conda activate nbx
pip install jupyter
```

If you already have an existing Conda environment that already contains the
Python packages you need, point nbx at that Python interpreter using NBX_PYTHON.
Examples:

```bash
# find the interpreter path (after activating the env or using `conda run`)
conda activate myenv
which python
# or
conda run -n myenv which python

# then set NBX_PYTHON to that path and run nbx
export NBX_PYTHON=/home/user/miniconda3/envs/myenv/bin/python
nbx lab1.md

# Or run without exporting:
NBX_PYTHON=/home/user/miniconda3/envs/myenv/bin/python npx github:glitchoff/nbx lab1.md
```

NBX_PYTHON tells nbx which Python to use for executing notebook cells — useful
when you want to reuse an existing environment instead of creating a new one.

If your network or corporate firewall blocks automatic browser downloads, you can
manually provide a Chromium/Chrome executable. Download a Chromium build from the
upstream GitHub releases (for example: https://github.com/chromium/chromium/releases)
and point nbx at the browser with NBX_BROWSER. Examples:

```bash
# Linux/macOS (after downloading/extracting a Chromium build):
export NBX_BROWSER=/path/to/chrome-or-chromium
nbx lab1.md

# Windows (PowerShell):
$env:NBX_BROWSER = 'C:\path\to\chrome.exe'
npx github:glitchoff/nbx lab1.md
```

If Playwright is used and cannot download browsers during install, consider
setting PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 during installation and providing a
browser via NBX_BROWSER as shown above.

This ensures Jupyter and other Python dependencies are isolated from your system
Python when needed. Use Conda or NBX_PYTHON only if they are available on your machine.

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
