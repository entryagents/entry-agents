# Entry Agents Desktop App Icons

Channel icon organization and build processes modeled after OpenCode:

- `icons/beta/`: Beta channel app icon (`icon.svg`, `icon.png`, `icon.ico`, `icon.icns`) with vibrant blue channel badge.
- `icons/prod/`: Production channel app icon without channel pill.

## Asset Generation Pipeline

1. **Source SVG:** `icons/beta/icon.svg` contains the canonical vector mark.
2. **PNG Rasterization:**
   - 1024x1024 base canvas: `npx svgexport icons/beta/icon.svg icons/beta/icon_1024.png 1024:1024`
   - Downsamples for Windows / Linux / macOS Dock: 512, 256, 128, 64, 48, 32, 16px
3. **Multi-Platform Bundling:**
   - Linux: `icon.png` (512x512)
   - Windows: `icon.ico` (multi-resolution embedded: 256, 128, 64, 48, 32, 16)
   - macOS: `icon.icns` (retina iconset with Big Sur padding and premultiplied alpha)
