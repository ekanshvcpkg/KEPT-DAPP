# KEPT website (site/)

This is a tiny static site the Solana dApp Store listing needs: a public page about the app (`index.html`), the
privacy policy (`privacy.html`) and the terms of use (`terms.html`). It's plain HTML and one `style.css`, with no build
step, scripts or external requests. The dApp Store portal checks that each link is a public HTTPS page, and broken
links are a named rejection reason. So deploy the site and open all three URLs before you submit.

## 1. Before deploying: fill in the placeholders

```bash
grep -rn "REPLACE_WITH" site/
```

Replace `REPLACE_WITH_CONTACT_EMAIL` (it appears in all three pages) with a mailbox the team actually reads. Use the
same address as the support/contact email in `docs/dapp-store/LISTING.md`. Data deletion requests will go there.

`index.html` links to `github.com/ekanshvcpkg/KEPT-DAPP`, the public repo the README uses. Change it if the team
publishes from another repo.

If the app's data handling changes (for example, photos start being stored, or the vision model provider changes),
update `privacy.html` and its "Last updated" date in the same change.

## 2a. Deploy with Vercel (simplest)

Use either of these:

- **Dashboard:** New Project → import the repo → set **Root Directory** to `site` → Framework Preset **Other** →
  leave the build command empty → Deploy.
- **CLI:** run `npx vercel@latest deploy --prod` from inside `site/`. The first run asks you to log in and name the project.

URLs: `https://<project>.vercel.app/`, `/privacy.html`, `/terms.html`.

**Don't deploy over `keptdapp.vercel.app` by accident.** That domain serves `/.well-known/assetlinks.json`, which the
app's wallet identity and deep links depend on (`frontend/app.json`, `frontend/src/config/env.ts`). Use a new
project name, such as `kept-site`. If the team does control `keptdapp.vercel.app` and wants the pages there, first copy
its current `.well-known/assetlinks.json` into `site/.well-known/`. Then add the new dApp Store signing key's SHA-256
fingerprint and the `delegate_permission/common.get_login_creds` relation (see
`docs/notes/app-devnet-run-2026-11-26.md`).

## 2b. Deploy with GitHub Pages

A branch-based Pages deployment can only serve the repo root or `/docs`, not `/site`. Pick one of these:

- **Separate repo (no workflow needed):** create a public repo (e.g. `kept-site`), copy the four files from `site/`
  into its root, then Settings → Pages → Deploy from a branch → `main` / root. URL:
  `https://<user>.github.io/kept-site/`.
- **Same repo, with a workflow:** add a Pages workflow that uploads `site/` with `actions/upload-pages-artifact` and
  deploys it with `actions/deploy-pages`, then Settings → Pages → Source: GitHub Actions. This adds a CI file, so the
  team should review it first.

GitHub Pages serves over HTTPS by default. Turn on "Enforce HTTPS" if you use a custom domain.

## 3. Check before you put the URLs in the listing

```bash
for p in "" privacy.html terms.html; do curl -s -o /dev/null -w "%{http_code} https://<your-site>/$p\n" "https://<your-site>/$p"; done
```

All three must return `200`. Then open each one on a phone to check that it reads well. Put the URLs in the
Publisher Portal: website, terms of use and privacy policy (`docs/dapp-store/LISTING.md` → "Links and contacts").
