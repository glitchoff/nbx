---
name: nbx
description: Author data-science practical files as a single .md master source and render them as submission-ready PDF/HTML/ipynb reports with the required formatting rules (Times New Roman, justified text, numbered headings, observations, page flow).
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