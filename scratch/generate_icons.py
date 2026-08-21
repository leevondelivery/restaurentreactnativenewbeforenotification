import os
from PIL import Image, ImageFilter, ImageEnhance

def generate_icons():
    logo_path = 'assets/images/leevon-logo.png'
    if not os.path.exists(logo_path):
        print(f"Error: {logo_path} not found")
        return

    orig_logo = Image.open(logo_path).convert('RGBA')
    
    # Trim empty alpha borders from orig_logo
    bbox = orig_logo.getbbox()
    if bbox:
        orig_logo = orig_logo.crop(bbox)

    lw, lh = orig_logo.size
    print(f"Cropped original logo size: {lw}x{lh}")

    canvas_size = 1024

    # 1. Generate icon.png (1024x1024, pure black background, logo sized ~52% of canvas height)
    target_h = int(canvas_size * 0.50)  # ~512px height
    aspect = lw / lh
    target_w = int(target_h * aspect)

    logo_resized = orig_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)

    # Create solid black background for icon.png
    icon_bg = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 255))
    
    # Create subtle ambient golden glow behind logo for luxury look
    glow_mask = logo_resized.split()[3]
    glow_img = Image.new('RGBA', (target_w, target_h), (212, 175, 55, 180)) # Warm gold glow color
    glow_canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    
    pos_x = (canvas_size - target_w) // 2
    pos_y = (canvas_size - target_h) // 2

    glow_canvas.paste(glow_img, (pos_x, pos_y), glow_mask)
    glow_blurred = glow_canvas.filter(ImageFilter.GaussianBlur(radius=25))

    # Composite icon.png
    icon_bg.paste(glow_blurred, (0, 0), glow_blurred)
    icon_bg.paste(logo_resized, (pos_x, pos_y), logo_resized)
    icon_final = icon_bg.convert('RGB')
    icon_final.save('assets/images/icon.png', 'PNG')
    print("Saved icon.png")

    # 2. Generate android-icon-foreground.png (1024x1024, TRANSPARENT background, logo ~46% of canvas for strict Android adaptive safe zone)
    fg_h = int(canvas_size * 0.46) # ~470px height (Android safe zone is central 66% circle, 46% ensures 0 clipping anywhere)
    fg_w = int(fg_h * aspect)
    logo_fg_resized = orig_logo.resize((fg_w, fg_h), Image.Resampling.LANCZOS)

    fg_canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    fg_pos_x = (canvas_size - fg_w) // 2
    fg_pos_y = (canvas_size - fg_h) // 2

    # Add light glow to foreground
    fg_glow_mask = logo_fg_resized.split()[3]
    fg_glow_img = Image.new('RGBA', (fg_w, fg_h), (212, 175, 55, 140))
    fg_glow_canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    fg_glow_canvas.paste(fg_glow_img, (fg_pos_x, fg_pos_y), fg_glow_mask)
    fg_glow_blurred = fg_glow_canvas.filter(ImageFilter.GaussianBlur(radius=20))

    fg_canvas.paste(fg_glow_blurred, (0, 0), fg_glow_blurred)
    fg_canvas.paste(logo_fg_resized, (fg_pos_x, fg_pos_y), logo_fg_resized)
    fg_canvas.save('assets/images/android-icon-foreground.png', 'PNG')
    print("Saved android-icon-foreground.png")

    # 3. Generate android-icon-background.png (1024x1024, solid pure black #000000)
    bg_canvas = Image.new('RGB', (canvas_size, canvas_size), (0, 0, 0))
    bg_canvas.save('assets/images/android-icon-background.png', 'PNG')
    print("Saved android-icon-background.png")

    # 4. Generate splash-icon.png (1024x1024, pure black background, logo ~45%)
    splash_bg = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 255))
    splash_bg.paste(fg_glow_blurred, (0, 0), fg_glow_blurred)
    splash_bg.paste(logo_fg_resized, (fg_pos_x, fg_pos_y), logo_fg_resized)
    splash_final = splash_bg.convert('RGB')
    splash_final.save('assets/images/splash-icon.png', 'PNG')
    print("Saved splash-icon.png")

    # 5. Generate favicon.png (48x48)
    fav = icon_final.resize((48, 48), Image.Resampling.LANCZOS)
    fav.save('assets/images/favicon.png', 'PNG')
    print("Saved favicon.png")

if __name__ == '__main__':
    generate_icons()
