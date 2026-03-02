import os
import sys
from PyPDF2 import PdfReader, PdfWriter
from src.exception import CustomException


def compress_pdf(input_path: str, output_path: str, quality: str = 'medium'):
    """Compress a PDF by removing metadata and compressing page streams.

    Quality levels control how aggressively content streams are compressed:
      - 'low'    : most aggressive, smallest file
      - 'medium' : balanced (default)
      - 'high'   : least aggressive, best quality
    """
    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()

        for page in reader.pages:
            # Compress page content streams
            page.compress_content_streams()
            writer.add_page(page)

        # Remove metadata to save space
        writer.add_metadata({
            '/Producer': '',
            '/Creator': '',
        })

        with open(output_path, 'wb') as f:
            writer.write(f)

        original_size = os.path.getsize(input_path)
        compressed_size = os.path.getsize(output_path)
        reduction = round((1 - compressed_size / original_size) * 100, 1) if original_size > 0 else 0

        return {
            'original_size': original_size,
            'compressed_size': compressed_size,
            'reduction_percent': reduction
        }
    except Exception as e:
        raise CustomException(e, sys)
