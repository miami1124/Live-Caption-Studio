"""產生不含私人素材的三頁公開測試簡報。"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "sample" / "sample-presentation.pdf"
WIDTH, HEIGHT = 1600, 900
BACKGROUND = "#EEF2EC"
INK = "#102019"
MUTED = "#607068"
ACCENT = "#2D8C68"


def find_font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default(size=size)


def page(number: str, eyebrow: str, title: str, body: str) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 24, HEIGHT), fill=ACCENT)
    draw.text((110, 85), eyebrow.upper(), fill=ACCENT, font=find_font(28, bold=True))
    draw.multiline_text((110, 205), title, fill=INK, font=find_font(74, bold=True), spacing=16)
    draw.multiline_text((115, 510), body, fill=MUTED, font=find_font(32), spacing=12)
    draw.text((1450, 790), number, fill=MUTED, font=find_font(24))
    return image


def main() -> None:
    pages = [
        page("01", "Live Caption Studio", "A presentation that\nspeaks another language.", "Open this sample PDF and test slide navigation."),
        page("02", "Real-time translation", "Speak in Chinese.\nRead subtitles instantly.", "Gemini Live Translate converts speech while you present."),
        page("03", "Ready", "English · Japanese · Korean", "Use your own Gemini API key. Your PDF stays on this computer."),
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pages[0].save(OUTPUT, "PDF", resolution=120, save_all=True, append_images=pages[1:])
    for image in pages:
        image.close()
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    main()
