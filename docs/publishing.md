# Publishing this site

How this documentation is built and deployed. This page doubles as the runbook for anyone
updating it.

## Approach

The site is **plain Markdown in `docs/` on the `main` branch**, rendered by GitHub Pages'
built-in Jekyll with GitHub-flavored Markdown (`markdown: GFM`), styled with the blog's
stylesheet vendored into the repo (`_layouts/default.html` + `assets/css/style.css`).

Chosen because it is the simplest reliable option:

- **No build tooling and no CI.** GitHub Pages converts Markdown automatically on every push to
  `main` — no workflow file, no secrets, no Node toolchain.
- **Markdown is the project's documentation language** — content stays reviewable in the repo
  and readable on GitHub.com before it is ever published.
- **`/docs` on `main` keeps the docs versioned with the code** they describe.
- **Custom look, still zero build tooling.** A hand-written `_layouts/default.html` plus
  `assets/css/style.css` (a port of the blog's `global.css` design) give the site its styling —
  Jekyll renders it all on push, still no workflow file, no Node toolchain. The layout is plain
  Liquid, the only server-side templating Pages allows, and the Pages safe-plugin set
  (`jekyll-relative-links`, `jekyll-titles-from-headings`, `jekyll-optional-front-matter`,
  `jekyll-default-layout`) is sufficient — no theme gem is declared.

## Pages status

GitHub Pages is **already enabled** for this repository — no Settings action is needed:

- **Source:** Deploy from a branch — branch `main`, folder `/docs`.
- **Build type:** legacy (the bundled Jekyll pipeline — no workflow file).
- **Site URL:** `https://devrkd.github.io/agentic-workflow/`.

GitHub builds and publishes on every push to `main`; the first build takes about a minute.
Deployment status is shown under **Settings → Pages** and as a check on each commit. Free-tier
Pages requires a public repository — this repo is public.

## Configuration

`docs/_config.yml` is the only config file:

```yaml
title: Agentic Workflow
description: A multi-agent development harness for opencode — four coordinated agents, slash commands, skills, schemas, rules, and a Slack bridge
markdown: GFM

url: https://devrkd.github.io
baseurl: /agentic-workflow

defaults:
  - scope:
      path: ""
      type: pages
    values:
      layout: default

nav:
  - label: Home
    url: /
  - label: Agents
    url: /agents.html
  - label: Commands
    url: /commands.html
  - label: Workflow
    url: /workflow.html
  - label: Handoff
    url: /handoff.html
  - label: Reference
    url: /reference.html
  - label: Slack integration
    url: /slack-integration.html
  - label: Publishing this site
    url: /publishing.html
```

- `markdown: GFM` makes the renderer match GitHub's own UI (tables, lists, and fenced code
  render identically in the repo browser and on the published site).
- `url` and `baseurl` make canonical links and asset paths resolve correctly under the project
  subpath. If the repo is renamed, these two lines are the only places that need updating.
- `defaults` applies `_layouts/default.html` to every page, so the Markdown files stay plain
  (no front matter required). The layout provides the masthead, side navigation with
  current-page highlight, footer, and dark-mode toggle, and loads `assets/css/style.css` — the
  blog's design, ported. No theme gem is declared; the default Primer theme is bypassed by the
  custom layout.
- `nav` feeds the side navigation's "Pages" group — one entry per page (eight in total).
- **No `plugins:` key** — the site relies on the Pages safe-plugin set only, which is enabled by
  default.
- **Google Analytics 4 is deliberately disabled**: `ga_id` is left unset, so the layout emits
  no GA loader, consent default, or consent banner. To enable analytics later, add
  `ga_id: G-XXXXXXXXXX` here — the gtag.js loader and consent banner are already wired into
  `_layouts/default.html`.

## Content conventions

- **Eight pages, one topic each**: `index.md`, `agents.md`, `commands.md`, `workflow.md`,
  `handoff.md`, `reference.md`, `slack-integration.md`, `publishing.md` — plain Markdown with
  no front matter.
- **Cross-page links end in `.md`** — e.g. `[Agents](agents.md)`. These resolve when browsing
  the repo on GitHub.com, and Jekyll rewrites them to `.html` on the published site.
- **No repo-relative links** (`../…`). "Open the file on GitHub" links use explicit blob URLs
  (e.g. `https://github.com/devrkd/agentic-workflow/blob/main/.opencode/agent/`); inline path
  mentions in prose stay as plain code spans.
- **Only portable Markdown** is used: headings, tables, lists, fenced code blocks, and ASCII
  diagrams. The default Pages pipeline does not render Mermaid, and some kramdown-only syntax
  is unavailable under GFM.
- **One H1 per page**, no front matter required. The layout uses the H1 as the page title
  (Jekyll's `jekyll-titles-from-headings`) and builds an "On this page" index from the H2/H3
  headings.
- **Styling lives in `assets/css/style.css` and `_layouts/default.html`.** They are a port of
  the blog's design; changes to the blog's stylesheet should be mirrored here.

## Updating content

1. Edit the relevant `.md` file in `docs/`.
2. Commit and push to `main` (directly or via PR).
3. Wait ~1 minute for the Pages build; verify at `https://devrkd.github.io/agentic-workflow/`.

When harness behaviour changes, update the corresponding page in the same PR as the change
(`agents.md`, `commands.md`, and `workflow.md` for agents, commands, and flow; `handoff.md` for
the handoff contract; `reference.md` for skills and shared assets; `slack-integration.md` for
the Slack bridge; this page for the publishing setup itself).

## Optional upgrades (not currently used)

- **Google Analytics 4** — set `ga_id: G-XXXXXXXXXX` in `docs/_config.yml`; the loader, consent
  default, and consent banner are already wired into the layout.
- **A Jekyll theme** (`minima`, `cayman`, or a remote theme) for a different look — a one-line
  `_config.yml` change.
- **MkDocs + Material** for sidebar navigation and full-text search — requires a GitHub Actions
  workflow (`peaceiris/actions-gh-pages` or similar) instead of the branch deploy.
- **A custom domain** — set it under Settings → Pages and add the `CNAME` DNS record; GitHub
  provisions TLS automatically.
