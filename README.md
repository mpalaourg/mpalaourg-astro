# Georgios Balaouras — personal site

Source for [mpalaourg.dev](https://mpalaourg.dev), a bilingual portfolio with projects, publications, Formula 1 writing, and an About page. English pages live at `/`; Greek pages live at `/el/`.

## Stack

- Astro 5 with the Cloudflare adapter and server rendering
- Tailwind CSS 4, MDX, and Astro content collections
- Cloudflare Pages Functions and D1 for API caching and translation limits

## Run locally

Requires Node.js and npm. From the project root:

```sh
npm install
npm run dev
```

`npm run dev` serves the site at `http://localhost:4321`. For the Cloudflare runtime and D1 bindings, use:

```sh
npm run db:migrate:local
npm run dev:local
```

The Cloudflare preview runs at `http://localhost:8789`. `dev:local` builds the site before starting Wrangler. Run it again after changing a server route or component.

## Configuration

`wrangler.jsonc` defines the Cloudflare Pages build directory and the `DB` D1 binding. The runtime also reads these secrets:

| Secret | Purpose |
| --- | --- |
| `DEEPL_API_KEY` | English to Greek translation of fact widget text |
| `LASTFM_API_KEY` | Recent music from Last.fm |

Store secrets in the Cloudflare Pages project settings in production. For local Wrangler preview, put them in an untracked `.dev.vars` file. Do not commit credentials.

Apply D1 migrations before deploying API changes:

```sh
npm run db:migrate:local
npx wrangler d1 migrations apply mpalaourg-site-cache --remote
```

The translation endpoint caches successful translations for 30 days and limits each request to 400 characters. D1 enforces 12 uncached requests per visitor per minute and a global budget of 12,000 uncached characters per UTC day. If D1 or the DeepL key is unavailable, the widget uses its existing fallback translation path.

## Editing content

- `src/content/projects/` and `src/content/projects-el/`: projects
- `src/content/publications/` and `src/content/publications-el/`: publications
- `src/content/formula/` and `src/content/formula-el/`: Formula 1 posts
- `src/pages/` and `src/pages/el/`: page layouts and language variants
- `src/components/`: shared widgets and page sections
- `public/`: directly served images and files

The schemas for content frontmatter are in `src/content/config.ts`. When adding a post, add its translated counterpart with the same slug if it should be available through the language switcher.

## Checks

```sh
npm run build
```

The production build checks content schemas and creates the Cloudflare output. For a runtime check, use `npm run dev:local` and visit the English and Greek pages, a missing route, and the API endpoints.
