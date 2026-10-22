# Themes

The interface comes in several designs, switched like the language: everyone picks
a design and light, dark or automatic (follows the device) in the menu or on the
sign-in page. The choice is stored per device in the cookies `theme` and `mode`, and
the server renders every page in it right away (attributes `data-theme` and
`data-mode` on `<html>`), so nothing flashes and no inline script is needed.

| Design              | Look                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classic` (default) | Parchment and ink: Garamond and a letterpress face for titles, gold rules, paper grain, ornaments. Dark mode is candlelight: dark desk, cards stay parchment. |
| `modern`            | Clean and calm: Inter throughout, neutral greys, white cards, one blue accent, no ornaments. Dark mode turns cards dark too.                                  |

## How it is built

Components never name colours or fonts directly. They use **roles**, and every theme
fills the same roles, the way every language fills the same text keys:

- **Colours** (CSS variables as RGB triplets, Tailwind classes in brackets):
  `primary` (+ `hover`, `deep`, `tint`) for header bars and main buttons;
  `on-primary` and `on-primary-accent` for text on them; `canvas` (+ `raised`) for the
  page; `card` (+ `edge`, `rule`, `past`) for surfaces; `ink` (+ `muted`, `faint`) for
  text; `line` for tree lines; `frame` for decorative borders; `accent` (+ `light`,
  `soft`, `deep`) for selection and highlights, `on-accent` for text on it; `link`;
  `on-tint` for badges on `primary-tint`; `portrait` and `on-portrait` for initials;
  `danger` (+ `soft`); `shadow` and `shadow-strong`.
- **Fonts:** `--font-display` (titles, `font-display`), `--font-text` (names and longer
  text, `font-text`), `--font-ui` (controls, the default).
- **Shapes and texture:** `--radius-card`, `--radius-panel`, `--radius-control`;
  `--grain`, `--vignette`, `--vignette-strength`, `--backdrop-glow`.
- **Slots:** class names for the parts whose look is more than a colour. Each theme
  styles them its own way:

  | Slot                         | Where                                                                      |
  | ---------------------------- | -------------------------------------------------------------------------- |
  | `surface`                    | Cards, panels, dialogs                                                     |
  | `page-backdrop`              | Page background behind the tree and admin pages                            |
  | `header-bar` / `header-rule` | Header bars and the sign-in cover / the rule under the tree's header       |
  | `cover`                      | The sign-in cover on top of `header-bar`, where a theme wants it different |
  | `title-text`                 | The big title lettering                                                    |
  | `framed`                     | Framed boxes (sign-in cover, tour)                                         |
  | `sheet-frame`                | Inner frame of the person info sheet; themes may leave it out              |
  | `person-card`                | Person cards in the tree                                                   |
  | `portrait-frame`             | Frame around portraits                                                     |
  | `selected-glow`              | The selected person                                                        |
  | `section-heading`            | Section titles in the info sheet                                           |
  | `ornament`                   | Purely decorative elements; themes may hide them                           |

Tailwind exposes the roles (`tailwind.config.js`); `src/styles/themes/<theme>.css`
holds one theme: its variables for light, for dark and for automatic (in a
`prefers-color-scheme` query), and its slots. Slot rules sit in `:where(...)`, so they
weigh no more than a plain class and utilities in the markup still win.

## Adding a theme

1. Copy `src/styles/themes/modern.css` to `src/styles/themes/<id>.css`, replace
   `modern` with `<id>` in the selectors and change the values and slots.
2. Import it in `src/styles/globals.css`.
3. Add `<id>` to `THEMES` and its browser bar colours to `BAR_COLOR` in
   `src/themes/themes.ts`.
4. Name it in all languages: `theme.names` in `src/i18n/messages/*.ts`.
5. New fonts: add the `@fontsource` package and import it in `src/pages/_app.tsx`
   (fonts are only downloaded when a theme uses them).

## Not themed

The PDF export prints in the chosen design but always light. Mails have their own
plain layout.
