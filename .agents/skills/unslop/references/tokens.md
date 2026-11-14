# Tokens

Starting values for each pass. When the project already has a good system, keep its values and only fix how they are used.

## Spacing scale

4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128

- Inside a control: 4 to 12
- Between related items, like rows in a list: 2 to 8
- Between groups, like a label and its list or two cards: 12 to 24
- Between sections: 32 to 64, landing sections 80 to 128
- Row heights: 32 compact, 36 default, 40 to 44 touch
- Hero: 96 to 128 from the navigation to the headline on desktop, 48 to 64 on mobile

## Neutral ramps

### Dark

| Role | Graphite | Warm | Ink |
| --- | --- | --- | --- |
| Deepest surface, like a sidebar | #0f0f10 | #12110f | #07080d |
| Page background | #141415 | #161513 | #0b0d14 |
| Card | #19191b | #1c1a18 | #11141c |
| Raised, like an active row or input | #232325 | #262421 | #1a1e28 |
| Hairline | primary text at 8% | primary text at 8% | primary text at 8% |
| Primary text | #ededed | #efe9de | #eef0f5 |
| Secondary text | #a1a1a6 | #aaa398 | #a3a9b8 |
| Muted text and icons | #85858b | #8a847a | #7a8296 |

### Light

| Role | Graphite | Warm | Ink |
| --- | --- | --- | --- |
| Page background | #fafafa | #f7f4ee | #f5f7fa |
| Card | #ffffff | #fdfbf7 | #ffffff |
| Raised, like an active row or input | #f4f4f5 | #efe9df | #eceff4 |
| Hairline | primary text at 8% | primary text at 8% | primary text at 8% |
| Primary text | #171717 | #1f1b16 | #111827 |
| Secondary text | #525252 | #5e554a | #4b5565 |
| Muted text and icons | #737373 | #7b7266 | #6b7487 |

## Radius

| Element | Radius |
| --- | --- |
| Keycap, tag, small button | 4 to 6 |
| Row, input, button | 8 to 10 |
| Card | 12 to 16 |
| Panel or window | 14 to 20 |

Nested radius: inner = outer − padding, never below 4.

## Motion

One easing curve for everything, `cubic-bezier(0.22, 1, 0.36, 1)`.

| Use | Duration |
| --- | --- |
| Hover, press, toggles | 120 to 180ms |
| Menus, popovers, tooltips | 160 to 220ms |
| Entrances, sheets, layout changes | 300 to 500ms |

---

Part of unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0. Keep this credit in copies and adaptations.
