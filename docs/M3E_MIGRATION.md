# M3E Migration Notes

## Current Baseline

This project is a plain `index.html + Tailwind + vanilla JS` app.

## Changes Applied (Phase 1)

1. Added `@m3e/web` dependency in `package.json`.
2. Added M3E import map + component bootstrap in `index.html`.
3. Added `assets/js/m3e-components.js` to register:
   - `@m3e/web/theme`
   - `@m3e/web/form-field`
   - `@m3e/web/button`
   - `@m3e/web/icon`
   - `@m3e/web/switch`
4. Wrapped app content with `<m3e-theme id="appTheme" ...>`.
5. Migrated key controls from native elements to M3E:
   - Add task input: `m3e-form-field`
   - Primary actions: `m3e-button`
   - Settings toggles: `m3e-switch`
6. Synced theme manager with M3E theme host (`color/scheme/variant/motion`).

## Changes Applied (Phase 2)

1. Migrated task list to M3E list components:
   - `m3e-selection-list`
   - `m3e-list-option`
   - `m3e-icon-button` (trailing delete action)
2. Migrated fullscreen quick-switch chips to M3E:
   - `m3e-filter-chip-set`
   - `m3e-filter-chip`
3. Migrated in-app notifications to `M3eSnackbar` service (`@m3e/web/snackbar`).

## Changes Applied (Phase 3)

1. Migrated collapsible cards to `m3e-expansion-panel`:
   - Heatmap section
   - History log section
2. Synced panel lifecycle with app behavior:
   - Heatmap `opened` -> chart resize + refresh
   - History `opened/closed` -> lazy render/cleanup
3. Reduced button elevation across variants to align with M3 Expressive visual rhythm.
4. Fixed add-task row alignment by using `hide-subscript="always"` and matching button height token.

## Changes Applied (Phase 4)

1. Switched task list container from `m3e-selection-list` to `m3e-list` (`variant="segmented"`), keeping `m3e-list-option` rows and selected-state visuals.
2. Updated fullscreen filter chips to expressive selected behavior:
   - selected task chip shows built-in check mark
   - rest chip (`休息`) keeps icon-only selected state (no check mark)
   - selected/unselected chips now use different corner shapes.
3. Continued Tailwind-control replacement with M3E form fields:
   - gantt date input wrapped by `m3e-form-field`
   - reminder/timeout numeric inputs wrapped by `m3e-form-field`.

## Component Mapping (Recommended)

- `.btn-filled/.btn-tonal/.btn-tertiary/.btn-error` -> `m3e-button`
- floating label input `.text-field` -> `m3e-form-field`
- custom checkbox switch -> `m3e-switch`
- task chips -> `m3e-filter-chip-set + m3e-filter-chip` (done)
- task list rows -> `m3e-list + m3e-list-option` (done)
- inline toast notification -> `M3eSnackbar` from `@m3e/web/snackbar` (done)

## Layout Guidance for Phase 2

Use adaptive breakpoints by window width:

- Compact: `< 600px`
- Medium: `600px - 839px`
- Expanded: `>= 840px`

Suggested layout for this app:

1. Compact
   - single column stack
   - keep quick actions close to timer section
2. Medium
   - two-column main content (`task list | metrics`)
   - collapsible analytics sections below
3. Expanded
   - keep two-column core area and move settings/history into a side panel region
   - reduce vertical scrolling pressure

## Notes

- Import map is now local (`/node_modules/...`) to avoid runtime CDN dependency.
- If you later move to a bundler (Vite/Webpack), replace import map with package imports (`import "@m3e/web/button"` etc.).
