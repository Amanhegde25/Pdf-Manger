import os
import sys
import uuid
import shutil
import io
from PyPDF2 import PdfMerger, PdfWriter, PdfReader
from src.logger import logger
from src.exception import CustomException


def convert_image_to_pdf(image_path: str, pdf_path: str):
    """Convert a JPG/PNG image to a single-page PDF."""
    try:
        from PIL import Image
        img = Image.open(image_path)
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(pdf_path, 'PDF', resolution=100.0)
        logger.info(f"Converted image to PDF: {image_path} -> {pdf_path}")
    except Exception as e:
        logger.error(f"Failed to convert image: {str(e)}")
        raise CustomException(e, sys)


def convert_docx_to_pdf(docx_path: str, pdf_path: str):
    """Convert a .docx file to PDF using docx2pdf."""
    try:
        import pythoncom
        pythoncom.CoInitialize()
        from docx2pdf import convert
        convert(docx_path, pdf_path)
        pythoncom.CoUninitialize()
        logger.info(f"Converted DOCX to PDF: {docx_path} -> {pdf_path}")
    except Exception as e:
        logger.error(f"Failed to convert DOCX: {str(e)}")
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
        logger.info(f"Merged {len(pdf_paths)} PDFs into {output_path}")
    except Exception as e:
        logger.error(f"Failed to merge PDFs: {str(e)}")
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
        logger.info(f"Encrypted PDF saved to {output_path}")
    except Exception as e:
        logger.error(f"Failed to encrypt PDF: {str(e)}")
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
            logger.info(f"Cleaned up folder: {folder_path}")
    except Exception:
        pass
