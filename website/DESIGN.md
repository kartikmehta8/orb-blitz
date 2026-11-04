---
name: Orb website
description: A white-and-ink public web system inherited from the current Orb Android app.
colors:
  canvas: "#fff"
  ink: "#121314"
  ink-pressed: "#34373b"
  muted: "#55595f"
  faint: "#6b7077"
  surface: "#f3f4f6"
  border: "#e8eaed"
  border-strong: "#d2d6db"
  blue: "#3d5afe"
  blue-soft: "#e6eaff"
  blue-ink: "#253a9a"
  green: "#1a7f4b"
  green-soft: "#e8f6ee"
  amber: "#9a5a0c"
  amber-soft: "#fff6e8"
  red: "#c22437"
  red-soft: "#fdedef"
  testnet: "#c2410c"
  testnet-soft: "#fff1e8"
  playground: "#f0f1f3"
  preview: "#eef0f3"
  terminal: "#17191d"
  terminal-muted: "#bfc3c9"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(56px, 6.6vw, 96px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(36px, 4.2vw, 60px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  feature-body:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  hero-body:
    fontFamily: "Inter, sans-serif"
    fontSize: "23px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  button:
    fontFamily: "Inter, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.3
  navigation:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
  mono:
    fontFamily: "Roboto Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
  search-input:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  review-amount:
    fontFamily: "Inter, sans-serif"
    fontSize: "38px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
rounded:
  mark: "11px"
  compact: "10px"
  field: "12px"
  review-button: "13px"
  button: "14px"
  panel: "16px"
  playground: "20px"
  sheet: "26px 26px 0 0"
  phone: "38px"
  pill: "99px"
  circle: "50%"
spacing:
  compact: "8px"
  inline: "12px"
  inset: "16px"
  regular: "20px"
  comfortable: "24px"
  panel: "28px"
  wide-panel: "35px"
  gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "17px 23px"
    height: "54px"
  button-primary-hover:
    backgroundColor: "{colors.ink-pressed}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "17px 23px"
    height: "54px"
  button-secondary-hover:
    backgroundColor: "{colors.border}"
  button-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "17px 23px"
    height: "54px"
  button-small:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.navigation}"
    rounded: "{rounded.field}"
    padding: "12px 18px"
    height: "44px"
  text-link:
    textColor: "{colors.ink}"
    typography: "{typography.navigation}"
    height: "44px"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "10px 15px"
    height: "44px"
  filter-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
  risk-safe:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.pill}"
    padding: "7px 11px"
  risk-warning:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber}"
    rounded: "{rounded.pill}"
    padding: "7px 11px"
  risk-danger:
    backgroundColor: "{colors.red-soft}"
    textColor: "{colors.red}"
    rounded: "{rounded.pill}"
    padding: "7px 11px"
  testnet-tag:
    backgroundColor: "{colors.testnet-soft}"
    textColor: "{colors.testnet}"
    rounded: "{rounded.pill}"
    padding: "3px 8px"
  faq-search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.search-input}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "50px"
  floating-orb:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    width: "55px"
    height: "55px"
  payment-sheet:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.sheet}"
    padding: "10px 18px 26px"
  review-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.review-button}"
    padding: "12px 10px"
    height: "44px"
  preview-panel:
    backgroundColor: "{colors.preview}"
    rounded: "{rounded.panel}"
    padding: "35px"
  download-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "36px"
---

# Design System: Orb website

## Overview

**Creative North Star: "The Orb in Context"**

Orb places precise wallet controls on a bright canvas. The current Android app supplies the identity: the original white glyph on a near-black mark, cool neutral surfaces, Inter for interface text and Roboto Mono for addresses and hashes. This is the completed replacement for the older purple website.

The system feels direct and readable, with generous space around dense, operable product examples. Black controls establish hierarchy; blue identifies links and keyboard focus; green, amber and red communicate a labeled risk state. Depth belongs to the phone and its temporary sheet rather than every resting panel.

**Key Characteristics:**

- White canvas, near-black actions and cool gray structure.
- Original Orb glyph in a black rounded mark.
- Locally bundled Inter and Roboto Mono.
- Large, tightly tracked headings beside compact product examples.
- Optional phone depth with stable keyboard, paused and reduced-motion states.

Extracted from the finished `public/style.css`, `src/site.css`, `src/interactions.jsx` and their built output in `dist/assets/interactions.css` and `dist/assets/interactions.js`. The app’s `app/src/theme.ts` at the verified source revision in PRODUCT.md is the identity authority; PRODUCT.md owns product truth and `.impeccable/surfaces/home.md` owns page strategy. These are website tokens, not a replacement for the native app’s type and spacing scale. The removed legacy purple styles are not a source for this system. Frontmatter owns base token values; the sidecar holds responsive thresholds, shadows, motion and self-contained component previews.

## Colors

The palette pairs white and near-black with cool structural grays and narrowly assigned accents.

### Primary

Ink is the primary action and heading color; Pressed Ink supplies primary-button hover feedback. White provides the inverse text and the page canvas. Primary actions stay visually decisive without a saturated fill.

### Secondary

Link Blue identifies link feedback, permission links, keyboard outlines and caret color. Its pale blue fill and darker blue text are confined to the voice example.

### Neutral

Muted Ink carries explanations; Faint Ink carries captions and metadata. Cool Surface, Playground Gray and Preview Gray distinguish nested product scenes and support panels. Border and Strong Border separate rows and controls. Terminal Ink and Terminal Muted provide the contained connection-template treatment; they do not switch the site to a dark theme.

### Semantic states

Green and its wash mean “Looks safe” or a completed local state. Amber and its wash mean “Be careful.” Red and its wash mean “Likely scam” or a failed download. Each verdict includes words and an icon. The orange Testnet pair labels a network rather than a risk rating. Example chat avatars and terminal code use contained supporting tones; those one-off illustration colors are not new brand accents.

**The App Identity Rule.** Use the current app’s white, ink and cool gray foundation. Blue is a link and focus accent; green, amber and red retain their semantic risk meanings.

## Typography

**Display and body font:** locally bundled Inter, with sans-serif fallback. Regular, medium and semibold files support weights 400, 500 and 600; the semibold declaration covers 600–800. **Technical font:** locally bundled Roboto Mono, with monospace fallback, at weight 400.

The frontmatter defines the base display, headline, title, body, feature body, hero body, button, navigation, label, mono, search and review-amount roles. Headings are semibold with compact leading and negative tracking. Supporting copy stays sentence case. Mono is reserved for addresses, hashes, limits and connection templates; the walkthrough preview remains Inter even though it is preformatted.

The final hero display is 66px from 601–800px and 54px at 600px and below, with 1.03 leading on mobile. The intermediate 60px and 62px declarations are overridden in the shipped cascade. Hero supporting copy becomes 17px at compact widths and 18px on mobile. Mobile section headings are 38px. Desktop download and privacy titles are 76px and 60px respectively; at mobile they become 46px and 42px. The download title also steps through 65px at 1100px and 55px at 800px.

Product-example text is predominantly 12–14px. The phone review amount uses the dedicated amount role, with a 23px currency label. Feature copy uses the feature-body role and mobile 14px overrides. FAQ answers use 15px/1.75, becoming 14px on mobile. The privacy reading body uses 16px/1.8, becoming 14px on mobile. The actual FAQ search input is 14px; do not import the obsolete 16px legacy field rule.

## Layout

The main shell is centered with a 1280px maximum outer width and the gutter token as its desktop inset. The header is capped separately at 1440px. Its height follows its content and vertical padding rather than a fixed bar height. Section rhythm is spacious: major blocks typically use 80–110px top spacing and 65–105px bottom spacing, while controls use compact gaps.

The desktop playground uses three columns: flexible context, a 350px phone stage and a 210px explanation rail, with a 690px minimum scene height. The phone itself remains 310 × 640px, with a dark 7px frame. Supporting feature and walkthrough grids use two columns; the safety lab uses a 1.2:1 split, the agent workspace 1.1:1, and the download layout 1.1:1. Privacy prose has a 920px maximum outer width, including shell padding.

Responsive changes follow the built CSS and interaction code:

- **At 1100px and below:** the playground rail disappears; the phone stage narrows to 330px and the context remains beside it. Supporting grids retain two columns with smaller gaps.
- **At 800px and below:** shell and header insets become 25px; section navigation is hidden; the phone stage becomes 320px. From 601–800px, the hero masthead stacks and its supporting copy/actions form an internal two-column row. App-picker text is visually hidden in this band, while each button retains its explicit accessible app name.
- **At 600px and below:** shell insets become 20px; the masthead, feature, safety, agent, walkthrough, control and download layouts stack. The desktop chat context is hidden and the app-picker labels return. The playground uses compact outer padding around the full phone; its footer controls wrap. The release stamp is hidden, release notes become one column and the footer becomes a vertical stack. Motion-control text is hidden while its accessible name remains.
- **At 360px and below:** the phone stage scales to 0.92 with negative block margins to recover space; sample-picker padding tightens and demo-stage controls center. This is the only layout-wide phone scaling rule.
- **At 767px and below:** the interaction code permits the one-time success turn when motion is enabled, pointer/touch is in use and the document is visible. This behavioral threshold is distinct from the 600px stacked-layout threshold.

The walkthrough supports horizontal swipes over 60px when horizontal travel exceeds vertical travel by 1.5×; vertical scroll and pinch zoom remain available. Search controls and chips wrap without changing their labels. Hashes and connection templates wrap long strings. Page strategy remains in the surface brief rather than becoming a global composition rule.

## Elevation & Depth

Most panels rest flat on white or cool gray, with fine borders separating rows. The device has a narrow gray edge and diffuse cast shadow; the floating Orb and temporary review sheet provide local depth inside it. ENS tokens use a small overlapping shadow. Selected sample-app controls and chat bubbles have faint contact shadows. The sidecar preserves exact values; none is a generic card shadow to apply everywhere.

**The Quiet Surface Rule.** Separate ordinary panels with tonal fills and fine rules. Reserve cast shadows for the device, floating Orb, temporary review sheet and small overlapping tokens.

The phone’s React Bits wrapper uses a bounded 5-degree pointer tilt, 1.008 hover scale and a gentle visible-only float. Glare, wrapper shadow, gyroscope, intro and click-to-flip effects are disabled; the phone supplies its own frame and shadow. Pause, reduced motion and keyboard use set tilt to zero, hover scale to one and float off. A pointer press returns the example to pointer mode. On eligible mobile success, one 360-degree turn runs for 900ms. It does not loop and is canceled when keyboard or quiet-motion mode takes over.

Ordinary button and icon feedback lasts 180ms with `cubic-bezier(.22,1,.36,1)`. Sheet/verdict reveals and FAQ answer entry use opacity and a small translation for 180ms; the voice waveform response lasts 240ms. Reduced motion and Pause motion remove CSS animation/transition and smooth scrolling and prevent these scripted spatial effects. State changes and all actions remain available. The example’s 650ms reading, 1800ms guided review and 700ms simulated processing waits are state timing, not a promise of app or network speed.

## Shapes

Controls are rounded rectangles rather than universal pills. The primary action uses the button radius; its compact header variant uses the field radius. Panels and illustrations use the panel radius, while the playground has its own broader corner. Chips and risk labels are pills; the floating Orb, status dots and avatars are circles. The review sheet rounds only its top corners. Chat bubbles retain directional corners.

The original Orb glyph stays white on the near-black mark, with no orbital-ring decoration or replacement sphere. Its normal mark is 36px with a 27px glyph and the mark radius; mobile header sizing is 32px with a 24px glyph. Larger release and feature marks keep the same silhouette. The phone has the dedicated phone radius and matching rear face for the success turn.

## Components

### Buttons and links

Primary, secondary and light buttons share medium Inter, the button radius and directional icons. The primary button darkens to Pressed Ink on hover; the secondary fill darkens to Border. The light variant stays white against the dark closing section. Hover-capable pointers move an arrow 2px right and 1px up. Press scales normal buttons to 0.98; disabled buttons use 0.4 opacity and a default cursor. The header variant is 44px high. Text actions and icon buttons generally retain 44px targets; the compact inline phone Cancel/Reset text actions are 36px high in the current implementation. Do not claim a universal native-app 48px target on this website.

Global keyboard focus is a 3px Link Blue outline with 5px offset; the search input uses a 3px offset. Text links turn blue on hover. The skip link becomes a visible bordered control on focus. The header motion toggle exposes a pressed state, changes between Pause/Resume labels and remains usable when its visible text is hidden on mobile.

### Navigation

The desktop section links use the navigation role and open vertical hit padding. They turn blue on hover and keep normal anchor behavior. At 800px and below, the section links disappear while the brand, motion control and Get Orb action remain. Footer links stay visible and wrap before the footer stacks.

### Filters, samples and status labels

Filter chips use a fine neutral border with transparent fill; selected chips use ink and white. Safety, FAQ and MCP selections expose `aria-pressed`. Sample app buttons use a white selected surface and faint contact shadow against Playground Gray. Their text hides between 601–800px, so explicit WhatsApp, Email and Telegram accessible names are retained. Risk labels pair a colored wash, matching text and an icon with the full verdict. The Testnet tag uses its separate orange pair. These status labels are passive, without button hover states.

### Phone, floating Orb and review sheet

The round floating Orb uses the original mark, its own contact shadow and a 0.95 press response. Selecting an app resets the local example. Tapping Orb shows reading feedback, then a review with amount, recipient, network and risk label. The sheet’s close control, Cancel and Escape reset the example; simulation leads to a receipt with copy and retry actions. Receipt status and loading feedback use status semantics. The site never connects a wallet; simulation labels are part of the component’s visual and content contract.

The Screen/Read/Review controls expose their selected stage. Play walkthrough runs one finite sequence and stops at a receipt. Stop walkthrough, Escape and app changes cancel pending timers. Paused and reduced-motion use keep the same reading/review/processing waits while removing spatial effects; do not document the old shortened 30ms timings. The 900ms success turn follows the mobile and motion guards described above.

### Safety and agent examples

The safety lab pairs a neutral sample-message panel with a colored verdict panel. Selected examples update the verdict, written reasons and icon together through a polite live region; the default is the amber urgent-message example. The terminal panel uses a contained dark treatment and wrapping Roboto Mono templates. Client selection changes the template and copy state. The adjacent approval sequence distinguishes idle, pending, approved and declined local examples; pending presents an ink approval button alongside a text Decline action. Example labels and placeholder configuration stay visible.

### Walkthrough

Four tabs use a fine baseline and a 2px ink selected underline, plus a filled numbered circle. Roving tab order, Left/Right and Home/End navigation track `aria-selected`. The preview sits on Preview Gray beside explanatory copy and stacks on mobile. Previous/next controls disable at the ends with the shared disabled treatment. Swipes supplement, rather than replace, these controls.

### Search and FAQ

The labeled search input sits inside a Cool Surface field with no independent border. It uses Link Blue for caret and focus. Topic chips combine with question-and-answer text search; a visible count and empty state explain the result. Expand/Collapse all applies to visible native disclosures and is hidden when no result matches. Native summary rows have fine top rules and a plus that rotates 45 degrees when open; answers keep their own readable width and enter with the bounded reveal when motion permits. Multiple disclosures may stay open, and filtering preserves their open states. This version has no legacy clear-search icon or lavender expanded-row fill.

### Download and setup

The download panel uses Cool Surface, the panel radius and a full-width primary action. Distinct labels cover prepare, downloading percentage, checksum verification, retry and Save verified APK. Busy preparation disables its action; a native progress bar and received-byte status accompany a separate Cancel action. Successful verification uses green status and an explicit Save link. Errors use red alert text and retain a retry path. The checksum disclosure uses wrapping mono text and a copy action. Do not replace verified state with decorative progress.

The five installation steps use native checkboxes, a numbered text column and fine dividers. The ink checkbox accent and green completed heading provide completion feedback, while a live count tracks locally persisted progress. The optional device-specific help is a native disclosure in a cool rounded panel. Privacy content uses the same shell, typography, buttons and footer with a narrower reading measure.

## Do's and Don'ts

### Do:

- **Do** inherit the current app’s white-and-ink identity and original glyph.
- **Do** pair each risk color with its written verdict and icon.
- **Do** preserve the phone’s readable text and rearrange surrounding content at responsive thresholds.
- **Do** retain named controls, visible blue keyboard focus and the motion pause control.
- **Do** use Inter for the interface and Roboto Mono for addresses, hashes and connection templates.
- **Do** expose download progress, verification, cancellation, retry and ready states as distinct interface states.

### Don't:

- **Don’t** restore purple or lavender as the site’s brand chrome.
- **Don’t** use blue as the default primary-button fill.
- **Don’t** add shadows to every resting card or turn all actions into pills.
- **Don’t** animate the phone’s tilt, hover scale or success turn during keyboard, paused or reduced-motion use.
- **Don’t** remove the sample and simulation labels from interactive product examples.
- **Don’t** promote illustrative controls or fixed example verdicts into claims about live integrations or guaranteed safety.
