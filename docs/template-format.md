# The template format

A template is **one HTML file** with the whole design of a poster: CSS, the page skeleton, fonts and pictures. A department can publish it as a single file; every poster keeps an unchanged copy as `template.html`, so a poster looks the same years later, and updating a poster to a new version of the template means replacing that one file.

Start from [templates/neutral.html](../templates/neutral.html), the only template in the repository. Writing a template takes HTML and CSS; no JavaScript is involved.

**Templates with logos stay out of the repository.** Logos and corporate designs usually may not be published with the code. Keep such templates in `templates/` on your computer (Git and the Docker image ignore everything there except `neutral.html` and the font licence), and give them to the people who need them as a file, or offer them on the server of your installation (see the README).

## Structure

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="poster-template" content="name=My Department; version=2026.1">
  <style>
    :root {                       /* SETTINGS: what posters may change in poster.yaml */
      --width: 841mm;             /* page size (required) */
      --height: 1189mm;
      --gap: 20mm;
      --font-size: 32pt;
      --primary: #008AC9;
    }
    :root:lang(de) { --figure-label: "Abb."; }
    /* the design … */
  </style>
</head>
<body>
  <article class="poster">        <!-- the page (required) -->
    <header><slot name="header"><h1>Title</h1></slot></header>
    <main><slot name="sections"><p>The boxes appear here.</p></slot></main>
    <aside class="references"><slot name="references"></slot></aside>
    <footer><slot name="footer"><p>Contact</p></slot></footer>
  </article>
  <style>/* fonts and pictures as data: URLs, see below */</style>
</body>
</html>
```

- **`class="poster"`** marks the page. It needs the width and height of the paper (`width: var(--width); height: var(--height)`); its edges are what gets printed.
- **Slots** are replaced by the poster's content: `header` by header.md, `footer` by footer.md, `sections` by the boxes of the layout map, `references` by the numbered reference list (empty if the poster cites nothing; without this slot, the list ends the last box). Only `sections` is required. The content of a slot is placeholder text: opened directly in a browser, the template shows itself with it.
- **The grid.** The element around `<slot name="sections">` becomes the grid (it gets the attribute `data-poster-grid`). Give it the remaining height of the page, for example `main { flex: 1; min-height: 0 }` in a page that is a flex column. The engine sets `display: grid` and the rows, columns and areas from the poster's layout map; the template sets the space between boxes (`gap`, default `var(--gap)`).
- **`--width` and `--height`** on `:root` are the paper size; printing uses them.

## Settings, variants, language

- **Settings** are the custom properties of the template. A poster changes them in poster.yaml (`settings: font-size: 30pt` sets `--font-size`); the engine warns about names the template does not define. Keep the ones meant for posters in a SETTINGS block at the top with a short comment each, like the existing templates.
- **Variants** are classes on `<html>`: `variant: compact` in poster.yaml adds `class="variant-compact"`. Use them for alternatives of the official design, such as another footer graphic (`.variant-compact footer { … }`); the included templates offer none.
- **Language**: `lang: de` in poster.yaml sets `<html lang="de">`. Use it for labels (`:root:lang(de) { --figure-label: "Abb."; }`); it also gives correct hyphenation.

## The HTML the engine produces

Write CSS for these elements; there are no other classes to know.

| Content | HTML |
|---|---|
| A box of the layout | `<section class="area" data-area="results" data-edge="right left">`; style a single box with `[data-area="results"]`. `data-edge` names the sides of the grid the box touches (`top`, `right`, `bottom`, `left`), whatever the layout, for example `[data-edge~="right"][data-edge~="bottom"]` for the box in the bottom right corner |
| Header (header.md) | `h1`, `p` (authors, then affiliations), `blockquote` (key message), `sup`, `u` |
| Sections | `h2`, `h3`, `p`, `ul`, `ol`, `li`, `strong`, `em`, `code`, `table` (Markdown tables), `pre > code` |
| Highlighted box | `blockquote`; with an icon: `blockquote > span.icon > svg` as first child |
| Picture | `figure > img` (or `figure > div[style="width: …"] > img`), `figcaption` |
| Picture with a title | `figure > div.figure-title` before the picture |
| Table from CSV | `figure.table > figcaption + table > thead + tbody` |
| Chart or diagram | `div.diagram > svg` (drawn by Pele; colours from `--pele-*`, see below), inside a `figure` when captioned |
| Wide figure | `figure.wide` (spans all text columns of its box) |
| Column break | `hr` (`---` in the text) |
| References (references slot) | `section.footnotes > h2 + ol`; the `h2` says "Footnotes" (replace it with a label in CSS, see the neutral template); links back are `a.data-footnote-backref`. Hide an empty slot's container with `:not(:has(li))` |
| Something wrong | `p.error`, `div.diagram.error` |
| Footer (footer.md) | `p` (pictures inside `p`), the contact block is usually the last `p` |

Figures and tables are numbered with CSS counters: `counter-reset: figure table` on the page, `counter-increment` on `figure:not(.table):has(figcaption)` and `figure.table`, the label in `figcaption::before`.

**Charts and diagrams** take their font and colours from custom properties on the page: `--pele-font`, `--pele-fg`, `--pele-muted`, `--pele-line`, `--pele-surface`, `--pele-border`, `--pele-accent` and the series colours `--pele-series-1` … `--pele-series-8`.

## What the engine adds

So that templates contain only design, the engine adds after the template's CSS:

- the grid of boxes (overriding the template), text columns inside boxes, `hr` as a column break, `.wide`; the first `h2` of a box spans all its text columns;
- `print-color-adjust: exact` and the paper size for printing (`@page`);
- in the preview: overflowing content stays visible, and boxes that do not fit get a red dashed outline;
- `data-file` on each box and on the elements around the header and footer slots, so a click in the preview opens the right file (the hovered one gets `data-hover` and a blue outline).

Defaults that the template may override are in `:where()` (no specificity): the gap, `min-width: 0` of boxes, `break-inside: avoid` for figures and quotes.

## One file: fonts and pictures

A template loads nothing from elsewhere: in the preview, a Content Security Policy blocks every network request, and scripts never run. Fonts and pictures are inlined as `data:` URLs, best in a `<style>` at the end of the file so the design stays readable at the top:

```css
:root { --logo: url(data:image/svg+xml;base64,…); }
@font-face { font-family: Jost; src: url(data:font/woff2;base64,…) format('woff2'); }
.logo { background: var(--logo) center / contain no-repeat; aspect-ratio: 261.5 / 103.5; }
```

To inline files, write their names relative to the template (`url(logos/faculty.svg)`, `src="logo.png"`) and run

```
node scripts/inline-assets.mjs my-template.html
```

It replaces every reference to a file with a `data:` URL and leaves everything else as it is, so it can run again after adding or replacing a file. Supported: woff2, woff, ttf, otf, svg, png, jpg, gif, webp.

## Checking a template

1. Copy it as `template.html` into a copy of [examples/welcome](../examples/welcome) and open that folder in the editor. The problems list names missing slots, missing `--width`/`--height` and settings the poster sets but the template lacks.
2. Try other layouts in poster.yaml (one box; three columns; a wide box with two text columns), `lang: de`, and each variant.
3. Print to PDF and check the page size and that nothing is cut off.
