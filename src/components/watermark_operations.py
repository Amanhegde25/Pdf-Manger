import os
import sys
import io
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color
from src.exception import CustomException


def create_watermark_page(text: str, width: float, height: float,
                          opacity: float = 0.15, rotation: int = 45,
                          font_size: int = 60) -> bytes:
    """Generate a single-page PDF with a centered text watermark."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width, height))

    c.setFillColor(Color(0.5, 0.5, 0.5, alpha=opacity))
    c.setFont("Helvetica-Bold", font_size)

    c.saveState()
    c.translate(width / 2, height / 2)
    c.rotate(rotation)
    c.drawCentredString(0, 0, text)
    c.restoreState()

    c.save()
    buffer.seek(0)
    return buffer.read()


def add_text_watermark(input_path: str, output_path: str, text: str,
                       opacity: float = 0.15, rotation: int = 45):
    """Overlay a text watermark on every page of a PDF."""
    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()

        for page in reader.pages:
            # Get page dimensions
            media_box = page.mediabox
            width = float(media_box.width)
            height = float(media_box.height)

            # Create a watermark page matching dimensions
            wm_bytes = create_watermark_page(text, width, height, opacity, rotation)
            wm_reader = PdfReader(io.BytesIO(wm_bytes))
            wm_page = wm_reader.pages[0]

            # Merge watermark onto the original page
            page.merge_page(wm_page)
            writer.add_page(page)

        with open(output_path, 'wb') as f:
            writer.write(f)

    except Exception as e:
        raise CustomException(e, sys)
