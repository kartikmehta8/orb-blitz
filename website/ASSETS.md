# Asset and release provenance

The Orb glyph and icon assets originate in the user-supplied private kartikmehta8/orb repository. Their initial website import was bd4a186f9e09f7f53c5333efb56526ea96d5ed73. The latest app b39038210af099a56b72d1e7dcd19b9ab3afe0bf supplies the current white/ink tokens and black overlay treatment. The website combines the original white glyph with a black control surface. The Android icon/social preview still uses the original purple icon; its origin is embedded in the PNG.

Inter and Roboto Mono are the app fonts, converted from TTF to WOFF2 without changing glyphs. Font license files live in public/assets and ship in dist/assets. UI and brand screen icons use official @tabler/icons, compiled to a local symbol sprite with its MIT license. WhatsApp and Telegram identify sample screens, with no partnership or API integration implied.

The current site imports the official React Bits Tilted Card component. Vendored source is pinned to DavidHDev/react-bits commit 4dc7b5b7772e1217c8fb8d2a7aa074302180e5b4; exact paths and provenance are in src/react-bits/PROVENANCE.json. The MIT with Commons Clause license ships as dist/assets/react-bits-license.txt. This is an integrated website, not a component library. React and React DOM bundle locally. No third-party CDN is required.

The unused café photo and its historical source material are excluded from this repository. No photograph ships in the redesigned page. Unused older GSAP browser assets and the discarded island stylesheet were removed; deterministic UI transitions use WAAPI/CSS and Tilted Card springs.

The Android APK was retrieved from private GitHub release v1.0.0, asset orb-v1.0.0-arm64.apk, built at b390382. User explicitly requested a public download page. Release metadata lives in release.json. Android apksigner validates its debug signature; the exact 37557960-byte file has SHA-256 3d947eb1d5bfa4d7a86dba6b6b4b7be7914fb5b12a7638c304a4f969ecc64cd8. Two static transport parts under public/downloads assemble into that exact APK and are verified in both build and browser. No GitHub credentials or private source archive are published.
