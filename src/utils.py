import os
import sys
from dataclasses import dataclass


@dataclass
class AppConfig:
    """Central configuration for the PDF merger application."""
    upload_folder: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
    max_content_length: int = 50 * 1024 * 1024  # 50 MB
    allowed_extensions: tuple = ('pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png')


def allowed_file(filename: str, allowed_extensions: tuple) -> bool:
    """Check if a file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions
