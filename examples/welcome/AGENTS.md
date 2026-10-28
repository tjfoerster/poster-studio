# Instructions for AI assistants

This folder is a scientific poster for Poster Studio. Full syntax: docs/poster-format.md in the Poster Studio repository.

## Files

- `poster.yaml`: template, language, settings and the **layout map** (which box goes where).
- `header.md`: `# Title`, a line of authors, a line of affiliations, then `> key message` (one sentence, across the full width).
- `sections/<name>.md`: the text of the box `<name>` in the layout map, usually starting with `## Heading`.
- `footer.md`: logos or QR code (`![](resources/qr.svg)`), notes, and the contact block as the last paragraph (lines end with `\`).
- `resources/`: the authors' material: papers, figures, CSV files. Figures and charts come from here.
- `template.html`: the design. **Do not edit it**; change settings in `poster.yaml` instead.

## Writing

- Markdown with GitHub tables and footnotes. Blocks: `::figure[Caption]{src=resources/x.png width=70%}`, `::table[Caption]{src=resources/x.csv}`, `::chart[Caption]{src=resources/x.csv type=bar|line|pie y="Axis title" horizontal}`, ```` ```mermaid ```` diagrams, `:::figure[Caption]` … `:::` around a diagram. In a box with two text columns, `{… wide}` on a figure, table or chart and `:::wide` … `:::` around text span both columns. `> [!lucide-icon-name] Text` puts an icon on a highlighted box. `[^label]` references are numbered across all files.
- Inline HTML only `<sup>`, `<sub>`, `<u>`, `<br>`. Notes that are not printed: `<!-- … -->`.
- Numbers only from `resources/`. Charts and tables read the CSV files directly; never retype data. Note the source of key numbers in a comment: `<!-- source: resources/paper.pdf, Table 2 -->`.
- About 300–800 words for A0, short sentences and bullet points. The title must fit on two lines.

## Layout

The layout map in `poster.yaml` is a picture of the grid: each name is a box (a file in `sections/`), a name repeated over cells makes the box bigger, `.` leaves a cell empty. Every name must cover a rectangle. A box spanning two columns sets its text in two columns. `rows: auto 1fr auto` sizes the rows ("auto" fits the content, "1fr" takes the rest). Write each row once, never repeat a row; for columns that stack boxes of different heights, make the last row `1fr` (`rows: auto auto 1fr`). The poster is read in bands from top to bottom, column by column within a band; figures and references are numbered in that order. The reference list is printed where the template puts it (in small print above the footer), not in a box.

## Checking

The editor lists problems with file and line (unknown blocks, missing files, boxes that do not fit) and outlines boxes that do not fit in red. Fix every problem before printing. Report every number on the poster with its source so that the authors can check it.
