# Guide: `app/layout.js` -- The Root Layout

## Purpose

Every page in the Orbit Deploy Console shares the same shell: the same fonts, the same global CSS, and the same data-fetching providers. The root layout file is where all of that is defined. Next.js requires exactly one root layout, and this is it. When a user visits any URL in the app, the HTML skeleton returned to the browser comes from this file.

Think of it as the picture frame. The individual pages are the pictures that get swapped in and out, but the frame stays the same.

---

## The Actual Code

```js
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata = {
  title: "Orbit Deploy Console",
  description: "Internal developer platform for deployment orchestration and environment control.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

## Line-by-Line Walkthrough

### Lines 1-3: Imports

```js
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/app/providers";
```

Three things are pulled in here, and each one solves a different problem:

1. **`next/font/google`** -- This is Next.js's built-in font optimization system. Instead of dropping a `<link>` tag into the HTML that points to Google Fonts (which forces the browser to make an extra network request, potentially causing a flash of unstyled text), Next.js downloads the font files at build time and serves them from your own domain. The result: faster loads, no layout shift, no third-party requests. We import two specific font families -- `Space_Grotesk` (a clean sans-serif used for headings and body text) and `IBM_Plex_Mono` (a monospace font used for code, log output, and version numbers).

2. **`"./globals.css"`** -- This is a side-effect import. It does not export a value; it just tells the bundler "include this CSS file for the entire application." This is where all the custom properties (`--surface-0`, `--accent`, etc.), layout classes (`.page`, `.panel`), and component styles (`.chip`, `.badge`) live. We cover this in depth in the `globals.css` guide.

3. **`@/app/providers`** -- The `@/` prefix is an alias configured in `jsconfig.json` that points to the project root. This import brings in the `Providers` component, which wraps the entire app in TanStack Query's `QueryClientProvider`. We cover that file in its own guide.

### Lines 5-8: Configuring the sans-serif font

```js
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});
```

Calling `Space_Grotesk()` does two things behind the scenes:

- It generates an optimized, self-hosted `@font-face` declaration.
- It returns an object with a `.variable` property containing a unique CSS class name.

The `variable: "--font-space-grotesk"` option tells Next.js to create a CSS custom property with that name. When the class is applied to an element, that element (and all its children) gain access to `var(--font-space-grotesk)` in CSS. Later, `globals.css` maps this to `--font-sans` through the `@theme` block so Tailwind and our own styles can reference it.

The `subsets: ["latin"]` option tells Next.js to only download the Latin character set, keeping the file size small. If this app needed to support Cyrillic or Greek text, you would add those subsets here.

### Lines 10-14: Configuring the monospace font

```js
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});
```

Same pattern as above, with one addition: `weight: ["400", "500"]`. Unlike Space Grotesk (which is a variable font that includes all weights in a single file), IBM Plex Mono requires you to specify which weights you want. `400` is normal/regular weight. `500` is medium weight (slightly bolder). By limiting to just these two, we avoid downloading font files we will never use.

This monospace font is used in the `.mono` CSS class and in the `.logRow` grid. Anywhere you see fixed-width text in the dashboard -- deployment logs, commit SHAs, version numbers -- it is rendered in IBM Plex Mono.

### Lines 16-19: Metadata export

```js
export const metadata = {
  title: "Orbit Deploy Console",
  description: "Internal developer platform for deployment orchestration and environment control.",
};
```

Next.js uses the App Router's metadata API to generate `<head>` tags. By exporting a plain object called `metadata` from a layout or page file, Next.js will automatically inject the correct `<title>` and `<meta name="description">` tags into the HTML. No need to manually write `<Head>` components.

This is a named export (not the default export), and Next.js picks it up by convention. You can add more fields here if needed -- `openGraph`, `icons`, `robots`, and so on.

### Lines 21-31: The RootLayout component

```js
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

This is the actual React component. Let us break down what is happening:

- **`{ children }`** -- This is a React prop. Whatever page you visit (`/`, `/settings`, etc.), Next.js will render that page's component and pass it in as `children`. The layout wraps it.

- **`<html lang="en">`** -- The root layout is the only place in a Next.js App Router project where you write the `<html>` and `<body>` tags. The `lang="en"` attribute tells screen readers and search engines that the page content is in English.

- **`className={...}`** -- Two CSS variable classes are applied to the `<body>`. Remember, `spaceGrotesk.variable` and `ibmPlexMono.variable` are class names generated by Next.js. Applying them here makes `--font-space-grotesk` and `--font-ibm-plex-mono` available to every element on the page.

- **`antialiased`** -- This is a Tailwind CSS utility class that applies `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale`. It makes text render with smoother edges on most screens.

- **`<Providers>{children}</Providers>`** -- The entire page tree is wrapped in the `Providers` component, which sets up TanStack Query. This means every component in the app can call `useQuery` without any additional setup.

---

## Concepts Taught

| Concept | Where It Appears |
|---|---|
| Next.js App Router root layout | The entire file |
| Font optimization with `next/font/google` | `Space_Grotesk()`, `IBM_Plex_Mono()` |
| CSS custom properties for fonts | `variable: "--font-space-grotesk"` |
| Side-effect CSS imports | `import "./globals.css"` |
| The `metadata` export convention | `export const metadata = { ... }` |
| Component composition with `children` | `RootLayout({ children })`, `<Providers>{children}</Providers>` |
| Path aliases (`@/`) | `import { Providers } from "@/app/providers"` |
| Tailwind utility classes | `antialiased` |

---

## Common Mistakes

### 1. Creating more than one root layout with `<html>` and `<body>`

Next.js only allows one root layout. If you create nested layouts (e.g., `app/dashboard/layout.js`), those nested layouts should NOT include `<html>` or `<body>` tags. They only wrap a part of the tree, not the whole document.

### 2. Forgetting to include font weights for non-variable fonts

Space Grotesk is a variable font, so omitting `weight` is fine -- it includes all weights automatically. But IBM Plex Mono is not a variable font. If you forget the `weight` array, Next.js will throw an error at build time. Always check the font's documentation to know whether it requires explicit weights.

### 3. Putting `"use client"` on the layout

The root layout is a Server Component. If you add `"use client"` to this file, you lose the ability to export `metadata` (which only works in Server Components) and you force the layout to be rendered on the client, which is wasteful. When you need client-side behavior (like the TanStack Query provider), extract it into a separate `"use client"` component (exactly what `providers.js` does) and import it here.

### 4. Using inline styles or `<style>` tags instead of the font variable system

You might be tempted to do `style={{ fontFamily: "Space Grotesk" }}`. This would bypass the font optimization entirely and fall back to the browser fetching from Google Fonts at runtime (or not finding the font at all). Always use the `variable` system and reference fonts via CSS custom properties.

### 5. Confusing `variable` with `className`

The `next/font` return object has both `.variable` and `.className`. Using `.className` applies the font directly to the element. Using `.variable` only makes the CSS custom property available. This project uses `.variable` because it wants to reference the fonts from CSS (`globals.css`), not hardcode them on the body tag. If you used `.className` instead, you would get the font applied to the body but could not reference it in your CSS custom properties.

---

## Mini Exercises

### Exercise 1: Add a third font

Suppose the design team wants to use `Fira Code` for inline code blocks inside documentation pages. Add it to the layout file.

Steps to try:
1. Import `Fira_Code` from `"next/font/google"`.
2. Configure it with `variable: "--font-fira-code"`, `weight: ["400"]`, and `subsets: ["latin"]`.
3. Add `firaCode.variable` to the `<body>` className template string.
4. In `globals.css`, create a `.code` class that uses `font-family: var(--font-fira-code), monospace;`.

Ask yourself: What happens if you forget to add the variable class to `<body>`? (Answer: the CSS custom property will not be defined, and `var(--font-fira-code)` will fall back to nothing, leaving the browser to use the generic `monospace` fallback.)

### Exercise 2: Add a favicon via the metadata export

The `metadata` object currently only has `title` and `description`. Add an `icons` field to set a favicon.

Try adding this to the `metadata` object:
```js
icons: {
  icon: "/favicon.ico",
},
```

Then check: where does Next.js look for `/favicon.ico`? (Answer: the `public/` directory at the project root. Alternatively, in the App Router you can place a `favicon.ico` file directly in the `app/` directory and Next.js will pick it up automatically.)

### Exercise 3: Trace the children flow

Draw (on paper or in your head) the component tree when a user visits the homepage `/`. You should be able to trace:

1. Next.js renders `RootLayout` and passes the page as `children`.
2. The page for `/` is `app/page.js`, which renders `<PlatformDashboard />`.
3. So `children` inside `RootLayout` is `<Home />`, which is `<PlatformDashboard />`.
4. That gets wrapped in `<Providers>`, which wraps it in `<QueryClientProvider>`.

Final tree: `<html>` > `<body>` > `<QueryClientProvider>` > `<PlatformDashboard />`.

Now ask: if you added a layout at `app/dashboard/layout.js`, and the user visited `/dashboard`, what would `children` be inside `RootLayout`? (Answer: it would be the dashboard layout component, which itself receives the dashboard page as its own `children`.)

---

## Further Reading

- [Next.js App Router: Layouts and Templates](https://nextjs.org/docs/app/building-your-application/routing/layouts-and-templates) -- Official documentation on how layouts nest and compose.
- [Next.js Font Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) -- Full reference for `next/font/google` and `next/font/local`.
- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) -- Every field you can put in the `metadata` export.
- [MDN: The `lang` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang) -- Why setting the language matters for accessibility.
- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties) -- The underlying mechanism that makes font variables work.
