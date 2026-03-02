import os
import sys
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
        logger.info(f"Converted DOCX to PDF: {docx_path} -> {pdf_path}")
    except ImportError:
        raise Exception("docx2pdf is not installed")
    except Exception as e:
        logger.error(f"Failed to convert DOCX: {str(e)}")
        raise CustomException(e, sys)


def convert_files_to_pdf(input_path: str, output_path: str, ext: str):
    """Route a file to the correct converter based on extension."""
    if ext in ('jpg', 'jpeg', 'png'):
        convert_image_to_pdf(input_path, output_path)
    elif ext in ('docx', 'doc'):
        convert_docx_to_pdf(input_path, output_path)
    else:
        raise ValueError(f"Unsupported file type for conversion: {ext}")
