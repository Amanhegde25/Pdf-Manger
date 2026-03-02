import os
import sys
import zipfile
import io
from PyPDF2 import PdfReader, PdfWriter
from src.exception import CustomException


def parse_page_ranges(range_str: str, total_pages: int) -> list:
    """Parse a range string like '1-3,5,7-9' into a sorted list of 0-based page indices."""
    pages = set()
    for part in range_str.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-', 1)
            start = max(1, int(start.strip()))
            end = min(total_pages, int(end.strip()))
            for i in range(start, end + 1):
                pages.add(i - 1)
        else:
            p = int(part.strip())
            if 1 <= p <= total_pages:
                pages.add(p - 1)
    return sorted(pages)


def split_pdf_all(input_path: str, output_dir: str) -> list:
    """Split every page into its own PDF. Returns list of output paths."""
    try:
        reader = PdfReader(input_path)
        outputs = []
        for i, page in enumerate(reader.pages):
            writer = PdfWriter()
            writer.add_page(page)
            out_path = os.path.join(output_dir, f"page_{i + 1}.pdf")
            with open(out_path, 'wb') as f:
                writer.write(f)
            outputs.append(out_path)
        return outputs
    except Exception as e:
        raise CustomException(e, sys)


def split_pdf_ranges(input_path: str, output_dir: str, range_str: str) -> list:
    """Split a PDF by user-specified page ranges. Returns list of output paths."""
    try:
        reader = PdfReader(input_path)
        total = len(reader.pages)
        pages = parse_page_ranges(range_str, total)

        if not pages:
            raise ValueError("No valid pages in the specified range")

        outputs = []
        writer = PdfWriter()
        for idx in pages:
            writer.add_page(reader.pages[idx])

        out_path = os.path.join(output_dir, "split_output.pdf")
        with open(out_path, 'wb') as f:
            writer.write(f)
        outputs.append(out_path)
        return outputs
    except Exception as e:
        raise CustomException(e, sys)


def create_zip_from_files(file_paths: list) -> bytes:
    """Create a ZIP archive in memory from a list of file paths."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for path in file_paths:
            zf.write(path, os.path.basename(path))
    buffer.seek(0)
    return buffer.read()
