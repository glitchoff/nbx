---
name: nbx
description: Convert .md master-source notebooks to clean .ipynb, .html, .md and PDF reports with a designed directive syntax. Use for generating submission-ready data-science practical reports from Markdown.
---

# nbx — skill

Convert a plain Markdown file that is structured as a "master source" notebook into a
clean, executed, print-ready report (PDF + HTML + ipynb). Used to build data-science
practical files with proper typography, page breaks and captions.

## When to use

- You have a data-science practical/assignment you need as a PDF report.
- You want a single readable Markdown source that is also a valid Jupyter notebook.
- You want execution + a designed report from one command.

## Input format (the .md master)

- Cells are separated by a line of **three-or-more `=`** characters.
- A cell's first non-blank line declares its type:
  - `Cell: code` — executable Python
  - `Cell: raw` — directives (optional)
  - `Cell: markdown` (or omitted) — prose
- Markdown cells use normal Markdown: `#`, `##` headings, `**bold**`, lists, tables,
  inline code, fenced code blocks. All are styled by the renderer.

Example:

```markdown
=====
---
Cell: markdown
# Practical 1 - Detect Missing Values

The Titanic dataset is used throughout.
=====
---
Cell: code
import pandas as pd
import seaborn as sns
df = sns.load_dataset('titanic')
print(df.shape)
=====
---
Cell: markdown
## 1.1 Check Missing Values

Missing values are detected with `isnull()`.
=====
---
Cell: code
print(df.isnull().sum())
=====
---
Cell: markdown
## Observations

1. `age` has 177 nulls; `deck` has 688.
```

The leading `---` line is optional. A bare `=====` ends a cell.

## Directives (optional, in raw cells)

`:::name<text>` inline or fenced (`:::name ... :::`):

| Directive | Purpose |
|---|---|
| `:::title` / `:::subtitle` / `:::date` / `:::meta<K :: V>` | Cover page |
| `:::index` / `:::toc` | Table of contents page |
| `:::section` | Section heading |
| `:::question` / `:::answer` | Q&A blocks |
| `:::note` / `:::tip` / `:::warning` / `:::keypoint` / `:::observation` | Callouts |
| `:::figure` | Figure caption |
| `:::metric<K\|V\|...>` | KPI tiles |
| `:::result<K :: V>` | Result line |
| `:::pagebreak` / `:::oddpage` / `:::appendix` | Page flow |

When a report only needs simple styling, **plain Markdown is sufficient** — directives
are optional.

## Output

`nbx <file.md>` produces, in the same folder:

- `file.ipynb` — executed notebook
- `file.html` — standalone designed report
- `file.pdf` — A4, Times New Roman, page numbers
- `file.md` (with `--md`) — raw-mode re-render

Code is syntax-highlighted with **Shiki** (rose-pine-dawn) at build time, offline.

## Common commands

```bash
nbx lab1.md                      # all outputs
nbx lab1.md --no-ipynb           # no notebook
nbx lab1.md --theme modern       # theme: academic | modern | plain
nbx lab1 lab2 lab7               # process folders, merge PDFs
nbx *.md --merge --output report # one combined PDF
nbx lab1.md --no-execute         # reuse saved outputs
```

## Environment

- Node >= 18
- `jupyter nbconvert` (executes cells)
- Chrome or Edge (prints PDF); override path with `NBX_BROWSER`

## Notes / gotchas

- Notebooks execute into a temp copy — source files are never mutated.
- Chromium can't compute cross-reference page numbers, so a TOC lists sections but no
  per-entry page numbers.
- Run `npm install && npm link` to expose the `nbx` command, then reload your shell.