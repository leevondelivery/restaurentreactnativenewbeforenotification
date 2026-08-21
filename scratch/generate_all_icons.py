import os
from PIL import Image, ImageDraw

def create_clean_icon_layers():
    logo_path = 'assets/images/leevon-logo.png'
    if not os.path.exists(logo_path):
        print(f"Error: {logo_path} not found")
        return

    orig_logo = Image.open(logo_path).convert('RGBA')
    
    # Crop empty transparent margin from original logo
    bbox = orig_logo.getbbox()
    if bbox:
        orig_logo = orig_logo.crop(bbox)

    lw, lh = orig_logo.size
    aspect = lw / lh
    print(f"Clean original logo dimensions: {lw}x{lh} (aspect ratio: {aspect:.3f})")

    # Helper function for crisp black background icon (for standard launcher & iOS)
    def build_solid_black_icon(size, logo_scale=0.58):
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 255))
        
        target_h = int(size * logo_scale)
        target_w = int(target_h * aspect)
        logo_res = orig_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)

        px = (size - target_w) // 2
        py = (size - target_h) // 2

        canvas.paste(logo_res, (px, py), logo_res)
        return canvas

    # Helper function for adaptive foreground icon (transparent bg, perfectly fitted for 66% Android safe circle)
    def build_adaptive_foreground(size, logo_scale=0.52):
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        
        target_h = int(size * logo_scale)
        target_w = int(target_h * aspect)
        logo_res = orig_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)

        px = (size - target_w) // 2
        py = (size - target_h) // 2

        canvas.paste(logo_res, (px, py), logo_res)
        return canvas

    # Helper function for round icon (circle mask on black)
    def build_round_icon(size, logo_scale=0.55):
        solid = build_solid_black_icon(size, logo_scale)
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size - 1, size - 1), fill=255)
        
        round_canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        round_canvas.paste(solid, (0, 0), mask)
        return round_canvas

    # Helper function for solid black background
    def build_solid_black_bg(size):
        return Image.new('RGBA', (size, size), (0, 0, 0, 255))

    # --- 1. Update Assets directory ---
    os.makedirs('assets/images', exist_ok=True)
    
    icon_1024 = build_solid_black_icon(1024, logo_scale=0.58).convert('RGB')
    icon_1024.save('assets/images/icon.png', 'PNG')
    print("Updated assets/images/icon.png")

    fg_1024 = build_adaptive_foreground(1024, logo_scale=0.52)
    fg_1024.save('assets/images/android-icon-foreground.png', 'PNG')
    print("Updated assets/images/android-icon-foreground.png")

    bg_1024 = build_solid_black_bg(1024).convert('RGB')
    bg_1024.save('assets/images/android-icon-background.png', 'PNG')
    print("Updated assets/images/android-icon-background.png")

    # Generate monochrome icon (clean white silhouette)
    mono_canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    target_h = int(1024 * 0.52)
    target_w = int(target_h * aspect)
    logo_res = orig_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
    px = (1024 - target_w) // 2
    py = (1024 - target_h) // 2
    mono_mask = logo_res.split()[3]
    white_img = Image.new('RGBA', (target_w, target_h), (255, 255, 255, 255))
    mono_canvas.paste(white_img, (px, py), mono_mask)
    mono_canvas.save('assets/images/android-icon-monochrome.png', 'PNG')
    print("Updated assets/images/android-icon-monochrome.png")

    splash_1024 = build_solid_black_icon(1024, logo_scale=0.55).convert('RGB')
    splash_1024.save('assets/images/splash-icon.png', 'PNG')
    print("Updated assets/images/splash-icon.png")

    fav_48 = icon_1024.resize((48, 48), Image.Resampling.LANCZOS)
    fav_48.save('assets/images/favicon.png', 'PNG')
    print("Updated assets/images/favicon.png")

    # --- 2. Update Android native res mipmap directories ---
    android_res = 'android/app/src/main/res'
    if os.path.exists(android_res):
        densities = {
            'mipmap-mdpi': {'adaptive': 108, 'legacy': 48},
            'mipmap-hdpi': {'adaptive': 162, 'legacy': 72},
            'mipmap-xhdpi': {'adaptive': 216, 'legacy': 96},
            'mipmap-xxhdpi': {'adaptive': 324, 'legacy': 144},
            'mipmap-xxxhdpi': {'adaptive': 432, 'legacy': 192},
        }

        for folder, dims in densities.items():
            dir_path = os.path.join(android_res, folder)
            os.makedirs(dir_path, exist_ok=True)

            adap_sz = dims['adaptive']
            leg_sz = dims['legacy']

            # Foreground (transparent with crisp clean gold splash logo)
            fg = build_adaptive_foreground(adap_sz, logo_scale=0.52)
            fg.save(os.path.join(dir_path, 'ic_launcher_foreground.png'), 'PNG')

            # Background (solid black #000000)
            bg = build_solid_black_bg(adap_sz).convert('RGB')
            bg.save(os.path.join(dir_path, 'ic_launcher_background.png'), 'PNG')
            webp_bg_path = os.path.join(dir_path, 'ic_launcher_background.webp')
            if os.path.exists(webp_bg_path):
                os.remove(webp_bg_path)

            # Legacy icon (ic_launcher.png)
            leg = build_solid_black_icon(leg_sz, logo_scale=0.58).convert('RGB')
            leg.save(os.path.join(dir_path, 'ic_launcher.png'), 'PNG')
            leg.save(os.path.join(dir_path, 'ic_notification_large.png'), 'PNG')

            # Round icon (ic_launcher_round.png)
            rnd = build_round_icon(leg_sz, logo_scale=0.55)
            rnd.save(os.path.join(dir_path, 'ic_launcher_round.png'), 'PNG')
            webp_rnd_path = os.path.join(dir_path, 'ic_launcher_round.webp')
            if os.path.exists(webp_rnd_path):
                os.remove(webp_rnd_path)

            print(f"Updated all icons in {folder} (Adaptive: {adap_sz}px, Legacy: {leg_sz}px)")

        # Sync to drawable density folders as well
        drawable_densities = {
            'drawable-mdpi': 48,
            'drawable-hdpi': 72,
            'drawable-xhdpi': 96,
            'drawable-xxhdpi': 144,
            'drawable-xxxhdpi': 192,
        }
        for d_folder, d_sz in drawable_densities.items():
            d_path = os.path.join(android_res, d_folder)
            os.makedirs(d_path, exist_ok=True)
            l_icon = build_solid_black_icon(d_sz, logo_scale=0.58).convert('RGB')
            l_icon.save(os.path.join(d_path, 'ic_notification_large.png'), 'PNG')
            l_icon.save(os.path.join(d_path, 'ic_launcher.png'), 'PNG')

if __name__ == '__main__':
    create_clean_icon_layers()
