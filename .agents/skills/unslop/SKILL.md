---
name: unslop
description: Turns vibecoded, AI-looking UI into a designed interface with its own character. Finds a direction from the product itself, then fixes spacing, color, icons, copy, type, layout, details, visuals and motion in that order, and can generate a real hero visual with an image tool when one is available. Use when the user asks to unslop, polish, clean up or redesign a screen so it stops looking AI-generated, or when a UI shows the usual tells like purple gradients, glows, gradient text, emoji labels, "New ✨" badges, glossy blobs, uppercase tracked labels, pulsing elements or uneven spacing. Works on React, Tailwind, HTML and CSS, for dashboards, apps and landing pages.
---
# Unslop

unslop was created by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), who started the Unslopping series on X. It is licensed under CC BY 4.0, so keep this credit in any copy or adaptation.

Vibecoded UI fails in the same predictable ways. Every surface glows, every label has an emoji, spacing is whatever the model typed that day, and the copy shouts. Unslopping fixes the craft and keeps the product. The features, content and order of sections stay. What changes is that every size, color, word and image becomes deliberate.

Removing slop is only half the job. A screen that is clean but could belong to any product is the next template. Every run ends with a screen that only this product could have.

The difference between slop and craft is where the richness goes. Slop spreads color and effects over the chrome, the backgrounds, buttons, borders and labels. Craft keeps the chrome quiet and puts the richness into one or two moments of content that people remember, like a rendered object, a beautiful chart or an image from the product's world.

Work like a designer doing a redline pass, one layer at a time, across the whole screen.

## What good looks like

- **One bright element.** Each screen has one polished thing that carries the color and the craft, a rendered object, a painted scene or a rich chart. Everything around it is quiet, so it reads instantly.
- **Quiet chrome.** Navigation, buttons and text use the tinted neutrals and one accent. Nothing glows, nothing competes with the bright element.
- **A clear idea.** You can say in one sentence what the visual shows and why it belongs to this product.
- **Text on calm space.** The headline sits on a part of the image or layout that was left empty for it, short and specific, with one primary and one secondary action and nothing stacked under them.
- **Real product, real material.** Previews look like the real app with plausible data, and objects look like real things with weight, light and shadow.

Which visual styles tend to work, and which fail, is in [references/visuals.md](references/visuals.md). Finished examples to learn from are in [references/refs.md](references/refs.md), and code treatments like drawing an image in glyphs are in [references/effects.md](references/effects.md).

## Run it

1. **Look at the screen.** Find the files that render it. If you can run the app or open the file in a browser and take a screenshot, do it, so you judge what people see and not only the code.
2. **Audit.** Go through [references/signs.md](references/signs.md) and list every sign you find, one line each with where it lives.
3. **Decide how much to change.** Read the audit honestly before planning anything.
   - **Heavy slop**, many signs across color, type, icons and copy. Run the full process below.
   - **Light slop**, a screen that is mostly designed with a few signs left. Polish mode. Fix only what the audit found, take the direction from the existing brand instead of inventing a new one, and keep the palette, type, layout and visual.
   - **No slop.** Say so plainly and suggest two or three small refinements at most, with exact values.
4. **Set the direction.** Write the five lines described below: Product, Character, World, Moments, Signature.
5. **Fix in nine passes, in order.** Spacing, Color, Icons, Copy, Type, Layout, Details, Visuals, Motion. Exact values for every pass live in [references/tokens.md](references/tokens.md).
6. **Check.** Run the checklist at the end of this file, render again and compare with the audit list. Anything still on the list gets fixed.
7. **Report** the direction, a few lines per pass about what changed, and any image prompt you wrote.

## Direction

Before touching anything, write five short lines. Derive them from what the page says the product does and who it is for. Never from what is trending.

- **Product.** What it does and for whom, in one plain sentence.
- **Character.** Two or three concrete words, like `calm, exact, a little warm` or `fast, technical, playful`. Words like clean, modern, sleek, minimal and premium are not allowed, because they describe every template.
- **World.** The place or material the product naturally belongs to. A note app lives near paper and ink, a monitoring tool near instruments and night shifts, a travel app near maps and window light. This world sets the tint of the neutrals, the accent and the visual.
- **Moments.** One or two places where the screen gets rich color, material and detail, chosen from what the product shows.
- **Signature.** One small detail only this product would have, used consistently.

## 1. Spacing

- Everything sits on a 4px grid. Margins, paddings, gaps and fixed heights are multiples of 4.
- Same thing, same size. All rows in a list share one height and one gap, all cards in a row share one padding.
- Space shows grouping. Space inside a group is smaller than space between groups.
- Things line up. Icons sit in one column, labels start on one line, numbers align right in one column.
- Padding follows density. Compact panels and sidebars around 16, cards 20 to 24, page edges 24 to 32.
- Navigation is the densest part of an app. Rows are 32 to 36 tall with 2 to 4 between them.

## 2. Color

- Build from one neutral ramp, tinted toward the world from the direction (graphite, warm, or ink).
- Three text roles: primary, secondary and muted.
- In the chrome, one accent, used rarely.
- Remove hue gradients on surfaces, gradient text, colored glows and colored shadows, radial color washes and blobs behind content, and neon borders.
- Borders are quiet hairlines, the text color of the ramp at 6 to 10% opacity.

## 3. Icons

- Every emoji used as an icon or as decoration in a label becomes a line icon from one set (lucide, 16 or 18px with a 1.5 stroke).
- Icons take the color of their text role, usually secondary or muted.

## 4. Copy

- Headlines say what the product does for whom, in plain words.
- No exclamation marks in interface text, and never `!!`.
- Headlines, subheads, labels, buttons and captions end without a period. Only paragraphs of several sentences keep their periods.
- No hype words like supercharge, seamless, unlock, magic, revolutionize or game-changing, and no `AI-powered` on everything.

## 5. Type

- A few sizes from a scale and two weights, 400 and 500, with 600 at most for rare emphasis. No 700 to 900 headings, no gradient text.
- Sentence case everywhere. Labels like `NAVIGATION` or `PAID THIS MONTH` with wide tracking become `Navigation` and `Paid this month`.
- Numbers use `tabular-nums` and one format across the screen.

## 6. Layout

- Apps and dashboards keep real app proportions.
- The strongest landing hero is a scene or asymmetric split with a real product view.
- On small screens everything stacks in reading order, the headline drops to the mobile size from the tokens and the visual comes after the actions.

## 7. Details

- Nested radius: inner = outer − padding, never less than 4. Controls 8 to 10, cards 12 to 16, panels 14 to 20.
- Counts and meta become quiet text, often mono and muted, instead of glowing pills.
- Keyboard shortcuts become small keycaps.
- Charts sit on a muted grid with muted mono labels.

## 8. Visuals

- Decorative filler goes (glossy blobs, orbs, nebulas, floating cubes, glowing grids).
- Show the real product or a single physical scene from the product's world.

## 9. Motion

- Remove motion that loops for no reason (`animate-pulse` or `animate-ping` on things that are not live).
- Remove `transition-all`, bouncy springs, `hover:scale` on cards.
- Transition color, background, border, opacity and transform explicitly (`transition-colors`, `transition-[transform,opacity]`).
- One easing curve (`cubic-bezier(0.22, 1, 0.36, 1)`) and short durations (120–180ms for hover/press).

## Checklist

- [ ] The direction is written and every pass follows it
- [ ] Every spacing value is on the 4px scale and equal things have equal sizes
- [ ] Icons, labels and numbers each sit in one aligned column
- [ ] One tinted neutral ramp, three text roles, one accent with enough contrast
- [ ] No hue gradients, gradient text, glows, colored shadows or color blobs
- [ ] No emoji left in the interface
- [ ] One icon set at one size and stroke
- [ ] Type chosen for the character, weights 400 to 600, no uppercase tracked labels, no italic, no negative tracking on small text
- [ ] No exclamation marks, no trailing periods on short strings, no greeting headline, no unverified claims
- [ ] Numbers in one format with tabular figures
- [ ] Nested radii add up
- [ ] No looping or bouncy motion, one easing curve, no animated layout properties
