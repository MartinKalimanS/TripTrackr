# Sunrise Passport: visual reference

Everything someone needs to build the Sunrise Passport UI _as it looks in the pictures_ lives in this folder.

> **Resumen (español).** Esta carpeta es la referencia visual de la interfaz "Sunrise Passport". Contiene las
> capturas del prototipo (`screens/`), el código del prototipo en HTML/CSS (`prototype/`), la especificación
> visual (`UI-SPEC.md`) y el plan de implementación paso a paso (`IMPLEMENTATION-PLAN.md`). Quien implemente la
> interfaz debe comparar su resultado con las capturas. Los textos están en inglés, como el resto de `specs/`.

| File                                                 | What it is                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [`UI-SPEC.md`](./UI-SPEC.md)                         | The visual specification: tokens, components, every screen with its pictures, states, text scale, what not to build |
| [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md) | The step-by-step plan from today's state to a finished, verified UI                                                 |
| [`overview.png`](./overview.png)                     | One sheet with the main frames side by side                                                                         |
| [`screens/core/`](./screens/core)                    | 64 pictures: Home, Trips, Trip, Welcome, You, the components board; light, dark, states, text scales                |
| [`screens/more/`](./screens/more)                    | 72 pictures: forms, photos, spending, notes, documents, offline maps, auth, search, recap, settings, states         |
| [`prototype/`](./prototype)                          | The HTML, CSS and JavaScript the pictures were rendered from (the source of every measurement)                      |

## The pictures

All pictures are **780 × 1688 px**, which is the reference phone at 2×: **390 × 844 dp** (iPhone 15: top inset 54,
bottom inset 34). Divide pixel measurements by 2 to get dp. Names follow one pattern:

| Suffix                         | Meaning                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| _(none)_                       | Light theme, "Sunrise"                                                     |
| `-dark`                        | Dark theme, "Nightfall"                                                    |
| `-contrast`                    | Light theme with increased contrast (7:1 text)                             |
| `-android`                     | Android (Material 3 navigation bar, rounded-square FAB, 16 dp list margin) |
| `-scale1.5`, `-scale2`         | Text scale 1.5 and 2.0: layouts must reflow, nothing may clip              |
| `-long`                        | Long strings (names, titles) to show wrapping and ellipsis                 |
| `-loading`, `-offline`, `-err` | The skeleton, offline and sync-error states                                |
| `-empty`, `-zero`, `-nocover`  | No trips, no stops, no cover photograph                                    |
| `-peek`, `-full`, `-collapsed` | Home sheet at its low and high positions; trip with its hero scrolled away |

Pictures in `screens/more/` that belong to features this project does **not** build yet (search, recap, settings,
permission primers, trip menu, delete confirmation) are kept so nothing is lost; `UI-SPEC.md` section 10 lists
them and what each needs.

## Opening the prototype

The prototype is static files. Serve the folder and open the board:

```bash
cd specs/005-sunrise-passport-ui/reference/prototype
python -m http.server 8099 --bind 127.0.0.1
# http://127.0.0.1:8099/index.html          core board: Home, Trips, Trip, Welcome, You, forms, states
# http://127.0.0.1:8099/extra/index.html    the other screens
```

Query parameters work on both boards (they are read by `tokens.js`):

| Parameter           | Effect                                                             |
| ------------------- | ------------------------------------------------------------------ |
| `?theme=dark`       | Nightfall                                                          |
| `?contrast=more`    | Increased contrast (combine with `theme=dark` for dark + contrast) |
| `?scale=1.5` or `2` | Text scale (every font size is `calc(var(--fs) * Npx)`)            |
| `?platform=android` | Android chrome                                                     |
| `?long=1`           | Long strings                                                       |

The prototype's CSS (`tokens.css`, `styles.css`, `extra/extra.css`, `extra/screens.css`) is where each dimension
comes from; when a picture and this document disagree on a number, **the CSS decides** and the document is wrong:
fix the document.

The photographs in `prototype/img/` come from Unsplash (Unsplash licence) and exist only so the pictures look
real. **They are never shipped in the app**: covers and thumbnails come from the traveller's own photographs or
from the generated covers (`UI-SPEC.md` section 3.9).

## Order of authority

1. The product rules and the data model (`AGENTS.md`, the constitution, `spec.md` "Tier 3" and "conflict" tables):
   a picture never overrides what the product may do.
2. The pictures in `screens/`, for look, layout, hierarchy and spacing.
3. `prototype/` CSS, for exact dimensions, colours and radii.
4. `UI-SPEC.md` and `contracts/*`, for names, ids, behaviour and the as-built details.
5. `IMPLEMENTATION-PLAN.md`, for the order of work.
