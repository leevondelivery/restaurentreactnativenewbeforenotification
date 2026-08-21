import os
import glob

def cleanup_webp():
    android_res = 'android/app/src/main/res'
    if not os.path.exists(android_res):
        print("android res folder not found")
        return

    # Find all webp files in mipmap folders
    webp_files = glob.glob(os.path.join(android_res, 'mipmap-*', '*.webp'))
    print(f"Found {len(webp_files)} webp files to remove...")

    for f in webp_files:
        try:
            os.remove(f)
            print(f"Removed duplicate webp: {f}")
        except Exception as e:
            print(f"Error removing {f}: {e}")

if __name__ == '__main__':
    cleanup_webp()
