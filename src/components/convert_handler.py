import os
import sys
import uuid
import io
from flask import jsonify, send_file
from werkzeug.utils import secure_filename
from src.components.convert_operations import convert_files_to_pdf
from src.components.pdf_operations import get_pdf_page_count
from src.utils import allowed_file


def handle_convert_upload(request, folder, config):
    """Handle file upload for conversion to PDF (images and DOCX)."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ('jpg', 'jpeg', 'png', 'docx', 'doc'):
        return jsonify({'error': 'Unsupported file type. Use JPG, PNG, or DOCX.'}), 400

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(folder, f"{file_id}.{ext}")
    file.save(saved_path)

    # Convert immediately
    pdf_path = os.path.join(folder, f"{file_id}.pdf")
    try:
        convert_files_to_pdf(saved_path, pdf_path, ext)
        os.remove(saved_path)  # Remove original after conversion
    except Exception as e:
        if os.path.exists(saved_path):
            os.remove(saved_path)
        return jsonify({'error': f'Conversion failed: {str(e)}'}), 500

    page_count = get_pdf_page_count(pdf_path)

    return jsonify({
        'id': file_id,
        'name': file.filename,
        'pages': page_count,
        'type': ext
    })


def handle_convert_download(folder, file_id):
    """Serve the converted PDF."""
    path = os.path.join(folder, f"{file_id}.pdf")
    if os.path.exists(path):
        with open(path, 'rb') as f:
            data = f.read()
        return send_file(
            io.BytesIO(data),
            as_attachment=True,
            download_name='converted.pdf',
            mimetype='application/pdf'
        )
    return jsonify({'error': 'Converted file not found'}), 404
