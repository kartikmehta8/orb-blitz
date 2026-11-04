# Orb website

Public product website and Android preview download, based on Orb v1.0.0 at b390382.

Use Node 22. From this directory:

```sh
npm ci
npm run verify
npm run dev
```

Open http://localhost:18788. `verify` builds the site and checks its routes, fragments, local assets, canonical metadata, icons, bundle budget and exact APK bytes/SHA-256.

Edit HTML, shared styles and static assets in `public/`, and React interactions in `src/`. `dist/` is generated and ignored. The build copies public files, bundles the React islands and Tilted Card CSS, and compiles the Tabler SVG sprite. Do not edit generated files. The download metadata comes from `release.json`; the two release parts live under `public/downloads/`. They remain byte-for-byte identical to the released APK.

## Vercel

Import `kartikmehta8/orb-blitz`, choose Root Directory **website**, and use the checked-in `vercel.json`: Other framework, `npm ci`, `npm run verify`, output **dist**. The production branch is **main**. Current public deployment: https://orb-website-lovat.vercel.app. GitHub Actions also runs the website check on pull requests and main pushes that change this folder.

In the dashboard (Settings → Build & Deployment), check:

- **Root Directory** is `website`. At the repository root Vercel never reads `website/vercel.json`.
- **Framework Preset** is Other. A Next.js preset fails with `Cannot read properties of undefined (reading 'fsPath')`, because this is not a Next.js app.
- Build, Output and Install Command overrides are off, so `vercel.json` applies.
- **Node.js Version** is 22.x, matching `engines`.

For CLI deployment, link from the repository root, then deploy:

```sh
npx vercel link --project orb-website --yes
SITE_URL=https://your-production-domain.example npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

The root `.vercelignore` excludes the Android app, agent server, dependencies and local environment files from CLI source uploads. Vercel's existing GitHub integration must have access to the selected repository for automatic Git deployments. The manual CLI deploy works independently of that integration.

Canonical, social, sitemap and robots URLs use `VERCEL_PROJECT_PRODUCTION_URL`, falling back to `VERCEL_URL`. Set `SITE_URL=https://your-domain.example` to override them for another host. Local builds use localhost by default. No server secrets, wallet keys or app backend are needed.

## Boundaries

The payment, safety and agent examples are local fixtures. The website never connects a wallet or sends a payment. APK downloads verify the release checksum before offering Save. The installation checklist stays in browser storage. Android APK preview limitations remain explained on the download page.

`PRODUCT.md` records product truth, `DESIGN.md` records the visual system and `ASSETS.md` records provenance. The APK is debug signed; publishing the website does not harden the Android app or its backend.
