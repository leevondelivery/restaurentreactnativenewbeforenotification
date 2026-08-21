import os
from PIL import Image

def generate_exact_icon():
    logo_path = 'assets/images/leevon-logo.png'
    if not os.path.exists(logo_path):
        print(f"Error: {logo_path} not found")
        return

    # Load original clean crisp logo
    orig_logo = Image.open(logo_path).convert('RGBA')
    
    # Trim any empty transparent padding around logo
    bbox = orig_logo.getbbox()
    if bbox:
        orig_logo = orig_logo.crop(bbox)

    lw, lh = orig_logo.size
    aspect = lw / lh
    print(f"Clean logo size: {lw}x{lh}, aspect ratio: {aspect:.3f}")

    def create_clean_black_icon(canvas_size, logo_scale):
        # Pure solid black background RGB(0,0,0)
        canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 255))
        
        target_h = int(canvas_size * logo_scale)
        target_w = int(target_h * aspect)
        logo_res = orig_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)

        px = (canvas_size - target_w) // 2
        py = (canvas_size - target_h) // 2

        canvas.paste(logo_res, (px, py), logo_res)
        return canvas

    def create_clean_adaptive_fg(canvas_size, logo_scale):
        # Transparent background for adaptive foreground
        canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
        
        target_h = int(canvas_size * logo_scale)
        target_w = int(target_h * aspect)
        logo_res = orig_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)

        px = (canvas_size - target_w) // 2
        py = (canvas_size - target_h) // 2

        canvas.paste(logo_res, (px, py), logo_res)
        return canvas

    # Generate test icon at 58% logo scale (perfect fit)
    icon_58 = create_clean_black_icon(1024, 0.58).convert('RGB')
    icon_58.save('assets/images/icon.png', 'PNG')
    
    # Generate adaptive fg at 53% logo scale (perfect adaptive safe-zone fit)
    fg_53 = create_clean_adaptive_fg(1024, 0.53)
    fg_53.save('assets/images/android-icon-foreground.png', 'PNG')

    # Generate solid black bg
    bg = Image.new('RGB', (1024, 1024), (0, 0, 0))
    bg.save('assets/images/android-icon-background.png', 'PNG')

    # Update splash-icon.png to match
    splash = create_clean_black_icon(1024, 0.55).convert('RGB')
    splash.save('assets/images/splash-icon.png', 'PNG')

    print("Generated clean crisp splash-style icons!")

if __name__ == '__main__':
    generate_exact_icon()
