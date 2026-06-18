# Game Assets

Generated images are optional. The game renders Canvas fallback art when files in `assets/game/` are missing.

Committed PNG files in `assets/game/` are released under the same MIT License as the project.

Expected transparent PNG names:

- `player.png`
- `goose-leg.png`
- `duck-leg.png`
- `cooked-leg.png`
- `burnt-leg.png`
- `fridge.png`
- `grill.png`
- `label-table.png`
- `serve-window.png`
- `notice-board.png`
- `trash.png`

`assets/raw/` and `assets/concepts/` are local generation intermediates. They are ignored by git and are not part of the open-source package.

`assets/game/manifest.json` lists deployable asset ids that should be loaded at runtime. Leave it as `[]` to use Canvas fallback art without noisy missing-file requests.

## Asset Sheet Generation

The committed PNG assets are already present, so generation is optional. To regenerate the mobile asset sheet, set your own `CODEX_API_KEY` and, if needed, `IMAGE_BASE_URL`. You can also provide a readable reference image with `ASSET_REFERENCE_IMAGE=/path/to/reference.png`.

No API key, token, or private image-generation credential is included in this repository.
