# Icon Generation

Create 3 PNG files with these specifications:

**icon16.png** - 16x16 pixels
**icon48.png** - 48x48 pixels
**icon128.png** - 128x128 pixels

## Design Concept:

🛡️ Shield symbol in green (#00ff00) on dark background (#1a1a1a)

Use any image editor or online tool:
- https://www.pixilart.com/draw
- https://www.photopea.com/
- Photoshop/GIMP

Or use these emoji-based placeholders:
- Copy the 🛡️ emoji
- Screenshot at different sizes
- Save as icon16.png, icon48.png, icon128.png

## Quick Command (requires ImageMagick):

```bash
# Create placeholder icons with ImageMagick
convert -size 16x16 xc:#1a1a1a -fill '#00ff00' -gravity center -pointsize 12 -annotate +0+0 '🛡' icon16.png
convert -size 48x48 xc:#1a1a1a -fill '#00ff00' -gravity center -pointsize 36 -annotate +0+0 '🛡' icon48.png
convert -size 128x128 xc:#1a1a1a -fill '#00ff00' -gravity center -pointsize 96 -annotate +0+0 '🛡' icon128.png
```

**Brand Identity:**
- Color: Green (#00ff00) = active protection
- Symbol: Shield = privacy defense
- Style: Dark, minimal, hacker aesthetic
