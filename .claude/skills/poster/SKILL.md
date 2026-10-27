---
name: poster
description: Create or revise a scientific poster in this project from the material in posters/<name>/resources (papers, figures, CSV data, notes). Use when asked to make, draft, fill, shorten, restructure, lay out or fix a poster.
---

# Building a poster from resources

## The project

- One folder per poster, usually `posters/<name>/` (or anywhere else; the folder is self-contained):
  - `poster.yaml`: template, `lang`, `settings`, `variant` (if the template offers one) and the **layout map**;
  - `header.md`: `# Title`, authors line, affiliations line, `> key message`;
  - `sections/<name>.md`: one file per box of the layout map;
  - `footer.md`: logos or QR code, notes, contact block as the last paragraph;
  - `template.html`: the design (one file); `resources/`: the source material; `AGENTS.md`: short rules.
- A new poster is a copy of `examples/welcome/` (copy the whole folder, then replace the text: its boxes explain the editor, none of that text belongs on a real poster).
- Full syntax: `docs/poster-format.md`; how templates work: `docs/template-format.md`.
- Preview: `npm run dev` starts the editor (the address is shown in the terminal, usually `http://localhost:5173/`); a poster in `posters/<name>` opens at `#dev/posters/<name>`. The user prints with **Print / PDF**.
- Do not edit `template.html`, `templates/` or `packages/`. Templates other than `templates/neutral.html` (for example with logos) are private: never copy them into `examples/` or anything that is committed. Change `settings:`, `lang` or `variant` in `poster.yaml` only when the user asks for another size, language, layout or colour.

## 1. Read every resource

- PDFs with the Read tool (all relevant pages), images by looking at them, notes in full.
- CSV files: header, a few rows and the size.
- Write down where each key fact comes from (file, page, table).

## 2. Plan before writing

- One key message in plain language: the `> ` line at the end of `header.md` (spans the full width).
- Sections, usually Background, Methods, Results, Discussion, Conclusion; follow the conference's requirements if given. Each section is a box: `sections/<name>.md`.
- Two to four visuals, chosen by what they show: a comparison or time course → `::chart` from a CSV; a study flow or process → a ```mermaid flowchart; an existing figure → `::figure`; exact values → `::table`; one important number → the key message, not a chart.
- About 300–800 words for A0. Posters are read from 1–2 m in a few minutes.
- The layout map: usually two columns for A0 portrait, three for landscape. Give the box with the most figures (often Results) more space: two rows, or two columns (it then sets its text in two columns). The poster is read in bands from top to bottom and within a band column by column; a box as wide as the poster starts a new band. The template prints the reference list (in small print above the footer), not a box.

## 3. Write the files

```markdown
<!-- header.md -->
# Title

<u>Presenting Author</u><sup>1</sup>, Second Author<sup>1,2</sup>

<sup>1</sup> Institute · <sup>2</sup> Department

> **Key message.**
```

```markdown
<!-- sections/results.md -->
## Results

Text, **bold**, lists, references[^smith2025].

::figure[Caption.]{src=resources/photo.png width=80%}
::table[Caption.]{src=resources/table.csv}
::chart[Caption.]{src=resources/data.csv type=bar y="Axis title"}

[^smith2025]: Smith A. Title. Journal. 2025;1:1–10.
```

```yaml
# poster.yaml
template: template.html
lang: en
layout: |
  background  results
  methods     results
  discussion  conclusion
rows: auto 1fr auto
```

- Footer: pictures (institute logos, QR codes) sit on the left; the last paragraph is the contact block (lines end with `\`); keep it to four or five short lines.
- `::chart` reads CSV columns: the first column holds the labels, each further column is one series (its header is the legend). `type`: `bar`, `line` or `pie`; `horizontal` for long labels; `width=80%` makes it narrower.
- Mermaid blocks (```mermaid) are drawn by Pele: flowcharts, timelines, `xychart`, `pie` and more. Put `:::figure[Caption.]` above and `:::` below them for a numbered caption. In narrow boxes prefer `flowchart TB`, in wide ones `flowchart LR`.
- A figure with a title: `:::figure{width=80%}`, title paragraph, empty line, `![](resources/x.svg)`, empty line, caption paragraph, `:::`.
- `> [!name] Text` puts a Lucide icon (names as on https://lucide.dev/icons, e.g. `goal` for the aim, `lightbulb` for the key message, `circle-check-big` for the conclusion) on a highlighted box. Only where it helps the reader find the box.
- References: `[^label]` with a meaningful label; a label must be defined once in the whole poster. Numbers follow the reading order.
- Inline HTML only `<sup>`, `<sub>`, `<u>`, `<br>`; notes as `<!-- … -->`. Escape stars for significance: `\*\*p < 0.01`.
- Layout map: each name covers a rectangle; `.` is an empty cell; every name needs `sections/<name>.md` and every section file must appear in the map.

Content rules:

- Numbers only from resources. Put a note next to key numbers: `<!-- source: resources/paper.pdf, Table 2 -->`.
- Charts and tables read the CSV files directly; never retype data. If data must be aggregated or reshaped, write the result to `resources/derived/<name>.csv` and describe how it was made in `resources/derived/README.md`.
- The title must fit on two lines in the preview; shorten it rather than lowering `title-size`.
- Short sentences and bullet points, the paper's terminology, abbreviations defined once.
- Charts: at most three series where possible (the first three palette colours are colour-blind safe), one y-axis.
- No inline styles or colours in the Markdown files.

## 4. Check the layout

- Make sure `npm run dev` is running (start it in the background if not).
- If you have a browser tool, open the poster in the editor, take a screenshot and check:
  - the problems list below the text (it names file and line): unknown blocks, missing files, unknown icons, boxes that do not fit ("Does not fit into its box", "The boxes are … mm taller than the space for them");
  - boxes with a red dashed outline do not fit;
  - how full each box is (aim for 85–100 %), reading order, legible labels, no heading at the bottom of a column inside a box.
- Without a browser tool, ask the user to open the poster in the editor and report the problems list.
- Levers: shorten text, `width` on figures, the layout map (which box spans what), `rows:` (`auto` fits the content, `1fr` takes the rest), `text-columns:`, `font-size` in `settings:`.

## 5. Deliver

- Tell the user how to save the PDF: **Print / PDF** (or Ctrl + P) → Save as PDF (the paper size is set automatically).
- Report the key message and structure, then list every number on the poster with its source so the authors can verify it, and anything that needs a human decision (official logo, unclear data, permissions for figures).
