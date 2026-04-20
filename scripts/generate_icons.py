from PIL import Image, ImageDraw
import os

size = 512
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Dark circle background matching the new UI
draw.ellipse([24, 24, 488, 488], fill=(6, 8, 15, 255))

# Mask for the minimalist "A"
mask = Image.new('L', (size, size), 0)
mask_draw = ImageDraw.Draw(mask)

# Thicker A shape for better 16x16 readability
chevron_points = [
    (120, 360),
    (256, 120),
    (392, 360),
    (300, 360),
    (256, 260),
    (212, 360)
]
mask_draw.polygon(chevron_points, fill=255)

# Futuristic dot in the center bottom
mask_draw.ellipse([226, 290, 286, 350], fill=255)

# Gradient layer
grad = Image.new('RGBA', (size, size), (0,0,0,0))
grad_pixels = grad.load()
for y in range(size):
    for x in range(size):
        # Diagonal gradient from Cyan to Purple
        ratio = (x + y) / 1024.0
        r = int(0 * (1 - ratio) + 112 * ratio)
        g = int(229 * (1 - ratio) + 0 * ratio)
        b = int(255 * (1 - ratio) + 255 * ratio)
        grad_pixels[x, y] = (r, g, b, 255)

# Apply gradient over the A shape
img.paste(grad, (0,0), mask)

os.makedirs('assets/icons', exist_ok=True)
resample = getattr(Image, 'Resampling', Image).LANCZOS

img.resize((128, 128), resample).save('assets/icons/icon128.png')
img.resize((48, 48), resample).save('assets/icons/icon48.png')
img.resize((16, 16), resample).save('assets/icons/icon16.png')

print('SUCCESS')
