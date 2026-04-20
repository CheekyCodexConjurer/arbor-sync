from PIL import Image, ImageOps, ImageDraw
import os

os.makedirs('assets/icons', exist_ok=True)
img = Image.open('source_logo.jpg').convert('RGBA')

# 1. Find the bounding box of the tree
gray = img.convert('L')
inverted = ImageOps.invert(gray)

# Threshold to ignore JPEG artifacts (white background might have small noise)
# Inverted white is 0. Noise might be up to ~15.
fn = lambda x: 255 if x > 20 else 0
mask_for_bbox = inverted.point(fn, mode='1')

bbox = mask_for_bbox.getbbox()

if bbox:
    # Crop tightly to the tree
    img_cropped = img.crop(bbox)
    
    width, height = img_cropped.size
    max_dim = max(width, height)
    
    # Tighter padding (8% around the tree)
    padding = int(max_dim * 0.08)
    new_size = max_dim + 2 * padding
    
    # Create a solid white background to paste the cropped tree onto
    solid_white = Image.new('RGBA', (new_size, new_size), (255, 255, 255, 255))
    
    # Center the cropped image
    offset_x = (new_size - width) // 2
    offset_y = (new_size - height) // 2
    solid_white.paste(img_cropped, (offset_x, offset_y), img_cropped if img_cropped.mode == 'RGBA' else None)
    
    # Create a smooth rounded rectangle mask
    radius = int(new_size * 0.22) # 22% border radius for a premium look
    mask = Image.new('L', (new_size, new_size), 0)
    draw = ImageDraw.Draw(mask)
    
    draw.rectangle((radius, 0, new_size - radius, new_size), fill=255)
    draw.rectangle((0, radius, new_size, new_size - radius), fill=255)
    draw.ellipse((0, 0, radius * 2, radius * 2), fill=255)
    draw.ellipse((new_size - radius * 2, 0, new_size, radius * 2), fill=255)
    draw.ellipse((0, new_size - radius * 2, radius * 2, new_size), fill=255)
    draw.ellipse((new_size - radius * 2, new_size - radius * 2, new_size, new_size), fill=255)
    
    # Apply anti-aliasing to the mask by shrinking
    # To get smooth edges, it's better to draw it large and resize down, 
    # but for an icon this manual drawing is usually fine when scaled down later by LANCZOS.
    
    # Apply the mask to make the corners transparent
    solid_white.putalpha(mask)
    final_img = solid_white
else:
    final_img = img

resample = getattr(Image, 'Resampling', Image).LANCZOS

final_img.resize((128, 128), resample).save('assets/icons/icon128.png')
final_img.resize((48, 48), resample).save('assets/icons/icon48.png')
final_img.resize((16, 16), resample).save('assets/icons/icon16.png')

print("Cropped and rounded logo successfully updated.")
