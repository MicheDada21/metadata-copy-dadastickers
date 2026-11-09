# Next.js App Router

Read the project's own Next.js docs in `node_modules/next/dist/docs/` first when its `AGENTS.md` asks for it; metadata APIs change between versions.

## Why subpages show the home metadata

- Metadata objects from the layouts and the page are merged **shallowly**. A page that sets `title` but no `description` inherits the root layout's description, and a page that sets its own `openGraph` loses every `openGraph` key from the layout it does not repeat, `images` included.
- Observed on Next.js 16.4 (October 2026): pages that set `openGraph: { title, url }` published the home description in `description`, `og:description` and `twitter:description`, and no `og:image` at all, even with `app/opengraph-image.png` in place. Pages that set `openGraph.images` explicitly kept their image and alt text.
- File-based metadata (`opengraph-image.*`, `twitter-image.*`, `*.alt.txt`) has priority over the `metadata` object.
- Streaming metadata: for browsers, `generateMetadata` output may land in `<body>`. Share crawlers such as `facebookexternalhit` get it in `<head>`, which is why `detect.ts` uses that user agent.

## Pattern

Keep the approved values in one module and build each page's `Metadata` from it, repeating the shared Open Graph keys so the shallow merge drops nothing.

```ts
// lib/page-metadata.ts
import type { Metadata } from "next";

const shared = {
  siteName: "Site name",
  locale: "it_IT",
  type: "website" as const,
  image: { url: "/opengraph-image.png", width: 1200, height: 630 },
};

type PageCopy = {
  title: string; // facts · statement, without the template suffix
  description: string;
  ogTitle: string;
  ogDescription: string;
  imageAlt: string;
};

// Values come from docs/metadati-dadastickers.json after check.ts --write.
export const pageCopy = {
  "/example": {
    title: "...",
    description: "...",
    ogTitle: "...",
    ogDescription: "...",
    imageAlt: "...",
  },
} satisfies Record<string, PageCopy>;

export function pageMetadata(path: keyof typeof pageCopy, extra: Metadata = {}): Metadata {
  const c = pageCopy[path];
  return {
    ...extra,
    title: c.title,
    description: c.description,
    alternates: { canonical: path },
    openGraph: {
      siteName: shared.siteName, locale: shared.locale, type: shared.type, url: path,
      title: c.ogTitle, description: c.ogDescription,
      images: [{ ...shared.image, alt: c.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: c.ogTitle, description: c.ogDescription,
      images: [{ url: shared.image.url, alt: c.imageAlt }],
    },
  };
}
```

```ts
// app/example/page.tsx
export const metadata = pageMetadata("/example");
```

- Keep any keys the page already sets (custom `title`, own images, `robots`) by passing them in `extra` or leaving them in place. Only eligible fields change.
- A root `title.template` such as `%s | Brand` adds its suffix to the page `title`. Record that suffix as `suffix` in the plan so the 60-character cap covers the rendered title.
- For a page with its own image (for example a page-specific preview), keep that image and put the plan's alt text on it.
- Dynamic routes: look the copy up by slug inside `generateMetadata`, or store the composed values with the content (for example in Convex) and read them there.
- After applying, run `bun run build`, start the build and rerun `detect.ts` against it.
