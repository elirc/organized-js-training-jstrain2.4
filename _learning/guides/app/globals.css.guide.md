# Guide: `app/globals.css` -- The Global Stylesheet

## Purpose

This single CSS file defines the entire visual language of the Orbit Deploy Console. Every color, every font, every layout pattern, and every component style lives here. When you look at the dashboard and see dark navy panels with green accent colors, monospace log output, and glowing card borders -- all of that is controlled by this file.

The file uses three different CSS technologies working together:
1. **CSS Custom Properties** (also called CSS variables) for colors and fonts.
2. **Tailwind CSS v4** (imported via `@import "tailwindcss"` and configured via `@theme`).
3. **Plain CSS classes** for layout, components, and responsive behavior.

Understanding this file teaches you how a real design system works at the CSS level.

---

## The Actual Code

The file is 370 lines long, so we will walk through it section by section.

---

## Section-by-Section Walkthrough

### Section 1: Tailwind CSS Import (Line 1)

```css
@import "tailwindcss";
```

This single line pulls in the entire Tailwind CSS v4 framework. In Tailwind v4, the framework is imported as a CSS file rather than configured through a `tailwind.config.js` file (the old way). This import gives you access to all of Tailwind's utility classes (`flex`, `gap-4`, `text-sm`, `antialiased`, etc.) throughout the project.

Tailwind v4 uses CSS-native features for configuration, which is why the next section uses `@theme` instead of a JavaScript config file.

### Section 2: Color Custom Properties (Lines 3-14)

```css
:root {
  --surface-0: #08111d;
  --surface-1: #0f1f33;
  --surface-2: #13283f;
  --surface-3: #1b3552;
  --line: #32537a;
  --text-1: #e7f0fc;
  --text-2: #9fb8d6;
  --accent: #6be08e;
  --warn: #f7b267;
  --danger: #f06f62;
}
```

`:root` is a CSS pseudo-class that matches the `<html>` element. Putting custom properties here makes them available everywhere in the document.

This is the project's **color palette**, and it follows a deliberate naming convention:

- **`--surface-0` through `--surface-3`**: Four shades of dark navy blue, from darkest (`#08111d`, nearly black) to lightest (`#1b3552`). These are used for backgrounds. `--surface-0` is the deepest background, `--surface-1` is for panels, `--surface-2` for cards, `--surface-3` for hover states. The numbered naming makes it easy to remember: higher number = lighter shade.

- **`--line`**: A medium blue-grey (`#32537a`) used for borders and dividers. Having a dedicated border color keeps the UI consistent -- you will see it referenced in `.panel`, `.chip`, `.logRow`, and many other classes.

- **`--text-1` and `--text-2`**: Two text colors. `--text-1` (`#e7f0fc`) is near-white for primary text. `--text-2` (`#9fb8d6`) is a muted blue-grey for secondary text like timestamps, descriptions, and labels.

- **`--accent`**: A green (`#6be08e`) used for success states and call-to-action elements. Think "deployment succeeded" or "service is live."

- **`--warn`**: An orange (`#f7b267`) for warnings. Used in alert badges and log rows with WARN severity.

- **`--danger`**: A red (`#f06f62`) for errors and failures. Used when a deployment fails or an alert fires.

Why custom properties instead of hardcoded hex values? Because if the design team decides to change the accent color from green to teal, you change one line (`--accent: #4dd0e1;`) and every component that uses `var(--accent)` updates automatically.

### Section 3: Font Theme Configuration (Lines 16-19)

```css
@theme inline {
  --font-sans: var(--font-space-grotesk);
  --font-mono: var(--font-ibm-plex-mono);
}
```

This is a Tailwind CSS v4 feature. The `@theme` directive tells Tailwind about custom design tokens. The `inline` keyword means these values are defined inline (as opposed to being imported from an external file).

- **`--font-sans`** is mapped to `var(--font-space-grotesk)`. Remember from the `layout.js` guide, the `Space_Grotesk()` font function creates a CSS custom property called `--font-space-grotesk`. This line bridges that property into Tailwind's theme system, so Tailwind's `font-sans` utility class uses Space Grotesk.

- **`--font-mono`** is mapped to `var(--font-ibm-plex-mono)`. Same idea for the monospace font.

This is how the font choices in `layout.js` flow through to the rest of the CSS system.

### Section 4: Body Styles (Lines 21-30)

```css
body {
  min-height: 100vh;
  margin: 0;
  color: var(--text-1);
  font-family: var(--font-space-grotesk), sans-serif;
  background:
    radial-gradient(circle at 12% 8%, #1d3a5a 0%, transparent 35%),
    radial-gradient(circle at 84% 18%, #27445f 0%, transparent 28%),
    linear-gradient(145deg, #050a13 0%, #071426 46%, #061224 100%);
}
```

- **`min-height: 100vh`**: The body is always at least as tall as the viewport. This prevents a short page from having the background cut off.

- **`margin: 0`**: Browsers add a default margin to `<body>`. This removes it.

- **`color: var(--text-1)`**: All text is near-white by default.

- **`font-family: var(--font-space-grotesk), sans-serif`**: Space Grotesk is the default font. If it somehow fails to load, the browser uses its built-in sans-serif font.

- **`background`**: This is the most visually interesting part. Three gradients are layered on top of each other (CSS allows comma-separated gradients):
  1. A radial gradient near the top-left (12% from left, 8% from top) that creates a subtle blue glow.
  2. A radial gradient near the top-right (84% from left, 18% from top) that creates another blue glow.
  3. A linear gradient at 145 degrees that covers the entire background with a very dark navy.

  The effect: the page looks like it has soft, distant light sources illuminating a dark surface. This is how the dashboard gets its "control room" aesthetic without using any images.

### Section 5: Reset and Utility Styles (Lines 32-39)

```css
a {
  color: inherit;
  text-decoration: none;
}

* {
  box-sizing: border-box;
}
```

- **`a` reset**: Links inherit their parent's color (instead of the browser default blue) and have no underline. In a dashboard app, links are styled contextually, not with the default blue-underline look.

- **`box-sizing: border-box`**: Applied to every element (`*`). This changes how `width` and `height` are calculated: padding and border are included in the element's total size, not added on top of it. Without this, a `200px`-wide box with `20px` of padding would actually be `240px` wide. With `border-box`, it stays `200px`. Virtually every modern project sets this globally.

### Section 6: Page Layout Classes (Lines 41-94)

```css
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}
```

The `.page` class is the outermost wrapper for the dashboard content. It stacks its children vertically (`flex-direction: column`) with `16px` gaps between them and `18px` of padding around the edges.

```css
.pageLoading {
  min-height: 100vh;
  display: grid;
  place-items: center;
  color: var(--text-2);
}
```

The `.pageLoading` class is used while data is being fetched. `display: grid` with `place-items: center` is the simplest way to center an element both horizontally and vertically. The muted text color (`--text-2`) makes the loading indicator feel unobtrusive.

```css
.topBar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  background: linear-gradient(145deg, #10273f 0%, #0d1f34 100%);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
```

The `.topBar` is the header section showing the project name and description. It uses `justify-content: space-between` to push the title to the left and any action buttons to the right. The gradient background is slightly different from the body gradient, which gives it a raised, layered appearance. The `box-shadow` adds depth.

```css
.layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 14px;
  align-items: start;
}
```

The `.layout` class creates the main two-column grid: a `320px`-wide sidebar on the left and the remaining space (`1fr`) for the main content. `align-items: start` prevents the sidebar from stretching to match the content height.

```css
.panel {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: linear-gradient(145deg, var(--surface-1), #0d2034);
  padding: 14px;
}
```

The `.panel` class is used for every card-like container in the dashboard. It has a subtle gradient, rounded corners, and a border in the `--line` color. This is the most-reused class in the project.

### Section 7: Utility Classes (Lines 106-143)

```css
.stack { display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; align-items: center; }
.row.space { justify-content: space-between; }
.row.gap { gap: 8px; }
.row.wrap { flex-wrap: wrap; }
.muted { color: var(--text-2); }
.tiny { font-size: 0.8rem; }
.mono { font-family: var(--font-ibm-plex-mono), monospace; }
```

These are small, composable utility classes. `.stack` arranges things vertically. `.row` arranges things horizontally. Modifiers like `.space`, `.gap`, and `.wrap` can be combined: `className="row space gap"`. The `.muted`, `.tiny`, and `.mono` classes handle typography variations.

### Section 8: Chip and Button Components (Lines 145-190)

```css
.chip {
  border: 1px solid #38608e;
  border-radius: 20px;
  padding: 5px 10px;
  background: #102640;
  color: var(--text-1);
  font-size: 0.82rem;
}

.chipActive { background: #19395f; border-color: #6ea2dc; }
.chipOk { border-color: #58b374; }
.chipWarn { border-color: var(--warn); color: #fbd7ac; }
```

Chips are small pill-shaped labels used to display tags, statuses, and filters. The base `.chip` style has a dark background and rounded corners. The modifier classes change the border color to convey meaning: `.chipOk` is green (things are fine), `.chipWarn` is orange (pay attention).

```css
.appButton {
  width: 100%;
  border: 1px solid #2f4f75;
  border-radius: 10px;
  background: #10253c;
  color: var(--text-1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  cursor: pointer;
}

.appButtonActive {
  border-color: #72b5ea;
  background: #173459;
}
```

The `.appButton` class is used for the application selection buttons in the sidebar. When selected, `.appButtonActive` gives the button a brighter border and lighter background to show it is active.

### Section 9: Form Styles (Lines 192-210)

```css
input,
select,
button {
  border: 1px solid #3a5f8a;
  border-radius: 8px;
  background: #10243b;
  color: var(--text-1);
  padding: 8px 10px;
  font: inherit;
}

button { cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
```

All form elements share the same base styling so they feel like part of the dashboard, not browser defaults. `font: inherit` is important -- without it, inputs and buttons use the browser's default font instead of Space Grotesk. `button:disabled` dims the button and changes the cursor to "not-allowed," giving clear visual feedback.

### Section 10: Timeline and Badge (Lines 212-247)

```css
.timeline {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
```

The `.timeline` class uses CSS Grid's `auto-fill` with `minmax` to create a responsive grid that fills as many 220px-wide columns as will fit. If the container is 700px wide, you get three columns. If it is 450px, you get two. No media queries needed.

```css
.badge {
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.72rem;
  border: 1px solid #36506f;
}
```

The `.badge` class creates small status indicators. The `border-radius: 999px` trick makes any element a perfect pill shape, regardless of its width.

### Section 11: Status Classes (Lines 249-266)

```css
.statusbuilding { border-color: #7ba7d9; }
.statusdeploying { border-color: #8ab5d8; }
.statuslive { border-color: #5cb57a; color: #c2f4d1; }
.statusfailed,
.statusrolled_back { border-color: #bd6a62; color: #ffd4d0; }
```

These classes are dynamically applied based on deployment status. Notice the naming pattern: `.status` + the lowercase status value. In the components, you will see something like `className={`badge status${deployment.status.toLowerCase()}`}`. This is a common technique for mapping data values to CSS classes. Live deployments get a green border and green text. Failed or rolled-back deployments get red.

### Section 12: Flow Diagram Wrapper (Lines 268-274)

```css
.flowWrap {
  height: 380px;
  border: 1px solid #2a4768;
  border-radius: 10px;
  overflow: hidden;
  background: #0a1727;
}
```

The `.flowWrap` class contains the React Flow pipeline visualization. It has a fixed height (`380px`) and `overflow: hidden` to prevent the diagram from spilling outside its container. The dark background (`#0a1727`) provides contrast for the node elements.

### Section 13: Grid Layouts (Lines 276-301)

```css
.twoCol {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.metricsGrid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
```

Two predefined grid layouts. `.twoCol` splits content into two equal columns. `.metricsGrid` creates four equal columns for the monitoring metric cards (CPU, memory, response time, error rate). The `minmax(0, 1fr)` prevents grid items from overflowing when their content is too wide -- it says "the minimum width is 0, not the content's intrinsic width."

### Section 14: Log Rendering (Lines 303-327)

```css
.logViewport {
  height: 320px;
  border: 1px solid #2d4a6a;
  border-radius: 10px;
  overflow: auto;
  background: #0a1727;
}

.logRow {
  display: grid;
  grid-template-columns: 84px 64px 80px 1fr;
  gap: 8px;
  font-family: var(--font-ibm-plex-mono), monospace;
  font-size: 0.78rem;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(39, 69, 99, 0.35);
}

.logRow.severror { background: rgba(178, 56, 56, 0.16); }
.logRow.sevwarn { background: rgba(160, 126, 53, 0.15); }
```

The log viewer is one of the most important parts of a deployment console. The `.logViewport` creates a scrollable container (`overflow: auto`) with a fixed height.

Each `.logRow` is a four-column grid: timestamp (84px), severity (64px), service name (80px), and the log message (remaining space, `1fr`). Using a grid instead of a table keeps the layout consistent without the complexity of table elements.

The severity-based background colors (`.severror`, `.sevwarn`) use `rgba` with low alpha values (0.16, 0.15) to create subtle tinted backgrounds. Errors get a red tint, warnings get an amber tint. The naming pattern (`.sev` + severity) mirrors the status class pattern.

### Section 15: Responsive Breakpoints (Lines 339-370)

```css
@media (max-width: 1080px) {
  .layout { grid-template-columns: 1fr; }
  .twoCol { grid-template-columns: 1fr; }
  .metricsGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .page { padding: 10px; }
  .topBar { flex-direction: column; }
  .metricsGrid { grid-template-columns: 1fr; }
  .logRow {
    grid-template-columns: 70px 54px 64px 1fr;
    font-size: 0.7rem;
  }
}
```

These media queries make the layout responsive:

At **1080px and below** (tablets and small laptops):
- The two-column `.layout` collapses to a single column (sidebar stacks above content).
- The `.twoCol` grid goes single-column.
- The `.metricsGrid` drops from 4 columns to 2.

At **640px and below** (phones):
- Page padding shrinks to `10px`.
- The `.topBar` stacks vertically instead of horizontally.
- The `.metricsGrid` goes single-column.
- Log rows get narrower columns and smaller text to fit the screen.

The breakpoints are chosen based on common screen widths. 1080px covers most tablet portrait orientations and smaller laptops. 640px covers most phones.

---

## Concepts Taught

| Concept | Where It Appears |
|---|---|
| CSS Custom Properties / Variables | `:root { --surface-0: ... }` |
| Tailwind CSS v4 integration | `@import "tailwindcss"`, `@theme inline` |
| CSS Gradients (radial and linear) | `body` background |
| Flexbox layout | `.page`, `.row`, `.topBar`, `.appButton` |
| CSS Grid layout | `.layout`, `.timeline`, `.logRow`, `.metricsGrid` |
| `auto-fill` with `minmax` for responsive grids | `.timeline` |
| `box-sizing: border-box` | The `*` selector |
| Component variant classes | `.chipOk`, `.chipWarn`, `.statuslive`, `.severror` |
| Data-driven class naming | `.status${status}`, `.sev${severity}` |
| Responsive design with `@media` queries | Two breakpoints at 1080px and 640px |
| RGBA for transparent overlays | `.logRow.severror` background |
| `minmax(0, 1fr)` to prevent grid overflow | `.twoCol`, `.metricsGrid` |

---

## Common Mistakes

### 1. Hardcoding colors instead of using custom properties

```css
/* Bad: */
.myComponent { color: #e7f0fc; }

/* Good: */
.myComponent { color: var(--text-1); }
```

If the design changes, hardcoded values need to be hunted down and replaced one by one. Custom properties are changed in one place.

### 2. Forgetting `minmax(0, 1fr)` in grid layouts

If you write `grid-template-columns: repeat(4, 1fr)` instead of `repeat(4, minmax(0, 1fr))`, a grid item with a long string (like a log message or URL) can force its column wider than `1fr`, breaking the layout. The `minmax(0, 1fr)` says "you can shrink to zero width if needed."

### 3. Using fixed widths for responsive layouts

The `.timeline` uses `minmax(220px, 1fr)` with `auto-fill` instead of hardcoding column counts. This means it adapts to any container width automatically. If you had written `grid-template-columns: repeat(3, 1fr)`, the layout would look wrong on narrow screens.

### 4. Not understanding the CSS specificity of combined class selectors

`.logRow.severror` (no space between the classes) means "an element that has both the `logRow` class AND the `severror` class." This is different from `.logRow .severror` (with a space), which means "an element with class `severror` that is a child of an element with class `logRow`." In this project, both classes are on the same element.

### 5. Adding new colors without a purpose

When you need a new color, first check if one of the existing custom properties works. The palette is intentionally limited (dark surfaces, two text colors, accent/warn/danger). Adding random hex values breaks the visual consistency.

---

## Mini Exercises

### Exercise 1: Add a new status color

The project currently has status styles for `building`, `deploying`, `live`, `failed`, and `rolled_back`. Suppose a new status called `QUEUED` is added. Create a `.statusqueued` class that uses a soft purple border:

```css
.statusqueued {
  border-color: #9b7ec8;
  color: #d4c4f0;
}
```

Then ask yourself: where in the component code would this class be applied? (Hint: look at how `.statuslive` is used -- the component builds the class name from the status string.)

### Exercise 2: Make the log viewport taller on large screens

Add a media query for screens wider than 1400px that makes the `.logViewport` taller:

```css
@media (min-width: 1400px) {
  .logViewport {
    height: 500px;
  }
}
```

Where should this go in the file? (Answer: after the existing media queries, at the end of the file. CSS is read top-to-bottom, and media queries should be organized from most general to most specific.)

### Exercise 3: Trace a color through the system

Follow `--accent` from definition to usage:

1. It is defined in `:root` as `#6be08e` (green).
2. Search the project's components for `var(--accent)` or the `accent` keyword.
3. Where does the green appear in the dashboard? (Hint: check chip styles, status indicators, and any "success" state.)

This exercise teaches you to trace design tokens through a codebase -- a skill you will use constantly in production work.

---

## Further Reading

- [MDN: CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties) -- The foundation of the color system.
- [MDN: CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout) -- How `.layout`, `.timeline`, `.logRow`, and `.metricsGrid` work.
- [MDN: CSS Gradients](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient) -- Understanding the `radial-gradient` and `linear-gradient` functions.
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs) -- How `@import "tailwindcss"` and `@theme` work.
- [MDN: Responsive Design](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design) -- The theory behind the `@media` breakpoints.
- [CSS-Tricks: A Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/) -- Reference for all the flex properties used in this file.
- [CSS-Tricks: A Complete Guide to CSS Grid](https://css-tricks.com/snippets/css/complete-guide-grid/) -- Reference for all the grid properties used in this file.
