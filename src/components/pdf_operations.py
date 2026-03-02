import os
import sys
import uuid
import shutil
import io
from PyPDF2 import PdfMerger, PdfWriter, PdfReader
from src.exception import CustomException


def convert_image_to_pdf(image_path: str, pdf_path: str):
    """Convert a JPG/PNG image to a single-page PDF."""
    try:
        from PIL import Image
        img = Image.open(image_path)
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(pdf_path, 'PDF', resolution=100.0)
    except Exception as e:
        raise CustomException(e, sys)


def convert_docx_to_pdf(docx_path: str, pdf_path: str):
    """Convert a .docx file to PDF. Requires Microsoft Word on Windows."""
    import platform
    if platform.system() != 'Windows':
        raise Exception("Word-to-PDF conversion requires Microsoft Word (Windows only)")
    try:
        import pythoncom
        pythoncom.CoInitialize()
        from docx2pdf import convert
        convert(docx_path, pdf_path)
        pythoncom.CoUninitialize()
    except ImportError:
        raise Exception("docx2pdf is not installed")
    except Exception as e:
        raise CustomException(e, sys)


def get_pdf_page_count(pdf_path: str) -> int:
    """Get the number of pages in a PDF file."""
    try:
        reader = PdfReader(pdf_path)
        return len(reader.pages)
    except Exception:
        return 0


def merge_pdfs(pdf_paths: list, output_path: str):
    """Merge multiple PDF files into one."""
    try:
        merger = PdfMerger()
        for path in pdf_paths:
            merger.append(path)
        merger.write(output_path)
        merger.close()
    except Exception as e:
        raise CustomException(e, sys)


def encrypt_pdf(input_path: str, output_path: str, password: str):
    """Encrypt a PDF with a password."""
    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.encrypt(password)

        with open(output_path, 'wb') as f:
            writer.write(f)
    except Exception as e:
        raise CustomException(e, sys)


def read_file_to_memory(file_path: str) -> bytes:
    """Read a file into memory and return bytes."""
    with open(file_path, 'rb') as f:
        return f.read()


def cleanup_folder(folder_path: str):
    """Remove a folder and all its contents."""
    try:
        if os.path.exists(folder_path):
            shutil.rmtree(folder_path)
    except Exception:
        pass
