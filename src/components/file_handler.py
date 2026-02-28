import os
import sys
import uuid
import io
from flask import jsonify
from werkzeug.utils import secure_filename
from src.logger import logger
from src.components.pdf_operations import (
    convert_docx_to_pdf, convert_image_to_pdf, get_pdf_page_count,
    merge_pdfs, encrypt_pdf, read_file_to_memory, cleanup_folder,
)
from src.utils import allowed_file


def handle_upload(request, folder, config):
    """Handle file upload, convert DOCX to PDF if needed, return metadata."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename, config.allowed_extensions):
        return jsonify({'error': 'File type not allowed. Use PDF, DOCX, JPG, or PNG.'}), 400

    file_id = str(uuid.uuid4())
    original_name = secure_filename(file.filename)
    ext = original_name.rsplit('.', 1)[1].lower()

    saved_path = os.path.join(folder, f"{file_id}.{ext}")
    file.save(saved_path)
    logger.info(f"File uploaded: {file.filename} ({ext})")

    # Convert to PDF if needed
    pdf_path = saved_path
    if ext in ('docx', 'doc'):
        pdf_path = os.path.join(folder, f"{file_id}.pdf")
        try:
            convert_docx_to_pdf(saved_path, pdf_path)
            os.remove(saved_path)
        except Exception as e:
            os.remove(saved_path)
            return jsonify({'error': f'Failed to convert Word file: {str(e)}'}), 500
    elif ext in ('jpg', 'jpeg', 'png'):
        pdf_path = os.path.join(folder, f"{file_id}.pdf")
        try:
            convert_image_to_pdf(saved_path, pdf_path)
            os.remove(saved_path)
        except Exception as e:
            os.remove(saved_path)
            return jsonify({'error': f'Failed to convert image: {str(e)}'}), 500

    page_count = get_pdf_page_count(pdf_path)

    return jsonify({
        'id': file_id,
        'name': file.filename,
        'pages': page_count,
        'type': ext
    })


def handle_remove(request, folder):
    """Remove a previously uploaded file from the session folder."""
    data = request.get_json()
    file_id = data.get('id')
    if not file_id:
        return jsonify({'error': 'No file ID provided'}), 400

    for f in os.listdir(folder):
        if f.startswith(file_id):
            os.remove(os.path.join(folder, f))
            logger.info(f"File removed: {f}")

    return jsonify({'success': True})


def handle_merge(request, folder):
    """Merge PDFs in order, optionally encrypt. Returns JSON with preview info (files kept for preview)."""
    data = request.get_json()
    file_ids = data.get('files', [])
    password = data.get('password', '')
    protect = data.get('protect', False)

    if not file_ids:
        return jsonify({'error': 'No files to merge'}), 400

    # Collect PDF paths in order
    pdf_paths = []
    for fid in file_ids:
        pdf_file = os.path.join(folder, f"{fid}.pdf")
        if os.path.exists(pdf_file):
            pdf_paths.append(pdf_file)
        else:
            return jsonify({'error': f'File not found: {fid}'}), 404

    if not pdf_paths:
        return jsonify({'error': 'No valid PDF files found'}), 400

    merged_path = os.path.join(folder, 'merged_output.pdf')
    merge_pdfs(pdf_paths, merged_path)

    # Password protect if requested
    final_name = 'merged_output'
    if protect and password:
        protected_path = os.path.join(folder, 'merged_protected.pdf')
        encrypt_pdf(merged_path, protected_path, password)
        os.remove(merged_path)
        final_name = 'merged_protected'

    return jsonify({
        'success': True,
        'preview_id': final_name,
        'protected': protect and bool(password)
    })
