import os
import sys
from PyPDF2 import PdfReader, PdfWriter
from src.exception import CustomException


def protect_pdf(input_path: str, output_path: str, password: str):
    """Add password protection to a PDF file."""
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


def remove_protection(input_path: str, output_path: str, password: str):
    """Remove password protection from a PDF file."""
    try:
        reader = PdfReader(input_path)

        if reader.is_encrypted:
            reader.decrypt(password)

        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)

        with open(output_path, 'wb') as f:
            writer.write(f)

    except Exception as e:
        raise CustomException(e, sys)
