# Editing this wiki

The wiki's source lives in the main repository under [`docs/wiki/`](https://github.com/brownnetuk/PawfectPetsSherborne/tree/main/docs/wiki), so pages are reviewed and versioned like code.

## How publishing works

The **Publish wiki** GitHub Action (`.github/workflows/publish-wiki.yml`) runs whenever a change under `docs/wiki/` reaches `main`. It copies the folder into the repository's wiki and pushes it. You can also run it by hand from **Actions > Publish wiki > Run workflow**.

Edits made directly in the wiki's web editor are **overwritten** on the next publish. Make changes in `docs/wiki/` instead.

## Conventions

- One file per page. The file name is the page name with hyphens: `Deployment-with-Portainer.md` becomes the "Deployment with Portainer" page.
- Link between pages with `[text](Page-Name)`, without `.md`.
- `Home.md` is the front page, `_Sidebar.md` the navigation and `_Footer.md` the footer. Add new pages to the sidebar.
- Mermaid diagrams work in fenced ` ```mermaid ` blocks.
- Keep pages practical and short. Exhaustive detail (every route, field and job) belongs in the repository README; link to it.
- Update the matching page when a change alters how a feature works, and update the version table in [Versioning and releases](Versioning-and-Releases) occasionally.
