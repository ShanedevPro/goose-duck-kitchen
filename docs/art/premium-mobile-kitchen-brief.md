# Premium Mobile Kitchen Art Brief

## Goal

Create a cohesive 9:16 mobile cooking-game scene for "鹅鸭小厨房": a fast tap-to-move game about cooking goose legs and duck legs, then labeling them honestly.

## Art Direction

- Premium cartoon mobile game UI.
- Warm illustrated night-stall kitchen.
- Wood counters, paper tickets, soft lantern lighting, cream highlights.
- Clear teal accents for duck-side objects and red/gold accents for goose-side objects.
- Cute but restrained; not childish, not noisy, not meme-heavy.
- No readable UI text inside the artwork.
- No official university logo, no school name, no watermark.

## Background Prompt

Portrait 9:16 mobile cooking game background, polished cartoon 2D illustration, warm night food-stall kitchen, wood counters and soft lantern lighting, clear empty central walking floor, mobile game composition, premium casual game style. Arrange stations so they are obvious but leave space for dynamic code-native labels: left upper side has two stacked ingredient fridges for goose and duck, center lower side has two grills, right upper side has two stacked label-printer counters, bottom center has a serving counter, bottom left has a small notice board, bottom right has a cute trash bin. Use red/gold accents for goose-side objects and teal accents for duck-side objects. No readable text, no logos, no watermark, no people, no UI numbers, no speech bubbles. Keep important objects away from the bottom 150 pixels so a native order dock can sit below the Canvas.

## Sprite Sheet Prompt

Create one square 4 by 4 sprite sheet for a portrait mobile cooking game. Use the same premium cartoon 2D style as the background: soft outlines, warm kitchen palette, compact mobile-game assets, clean silhouettes. Each cell contains exactly one centered isolated asset on a perfectly flat solid #00ff00 chroma-key background, with thin dark grid lines between cells. No readable text, no logos, no watermark.

Cell order left to right, top to bottom:
1 chef-idle: small cheerful student chef, red-white apron with subtle campus color cues, no official logo or school name
2 chef-walk-a: same chef, first walking frame
3 chef-walk-b: same chef, second walking frame
4 chef-carry-goose: same chef carrying a goose leg
5 chef-carry-duck: same chef carrying a duck leg
6 chef-carry-cooked: same chef carrying a golden cooked poultry leg
7 goose-raw-premium: raw goose leg, larger and red-gold cue
8 duck-raw-premium: raw duck leg, slightly smaller and teal cue
9 goose-cooked-premium: roasted goose leg, golden and larger
10 duck-cooked-premium: roasted duck leg, golden and slightly smaller
11 leg-burnt-premium: burnt poultry leg with dark crispy edges
12 station-glow: soft circular golden station highlight ring
13 success-pop: small celebratory burst with checkmark-like shape but no text
14 wrong-pop: small warning burst with cross-like shape but no text
15 tap-ring-premium: soft touch target ring
16 spare-effect: small steam puff effect

## Implementation Rule

Use generated art for the kitchen background and sprite-like assets. Use DOM/CSS for score, trust, time, orders, hints, restart, start modal, and all readable Chinese text.
