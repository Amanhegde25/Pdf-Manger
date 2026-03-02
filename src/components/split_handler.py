import os
import sys
import uuid
from flask import jsonify, send_file
from werkzeug.utils import secure_filename
from src.logger import logger
from src.components.split_operations import split_pdf_all, split_pdf_ranges, create_zip_from_files
from src.components.pdf_operations import get_pdf_page_count
from src.utils import allowed_file
import io


def handle_split_upload(request, folder, config):
    """Handle single PDF upload for splitting."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext != 'pdf':
        return jsonify({'error': 'Only PDF files can be split'}), 400

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(folder, f"{file_id}.pdf")
    file.save(saved_path)
    logger.info(f"Split upload: {file.filename}")

    page_count = get_pdf_page_count(saved_path)

    return jsonify({
        'id': file_id,
        'name': file.filename,
        'pages': page_count
    })


def handle_split(request, folder):
    """Split a PDF based on mode and page range. Returns ZIP for 'all', PDF for 'range'."""
    data = request.get_json()
    file_id = data.get('file_id')
    mode = data.get('mode', 'all')
    page_range = data.get('range', '')

    if not file_id:
        return jsonify({'error': 'No file specified'}), 400

    pdf_path = os.path.join(folder, f"{file_id}.pdf")
    if not os.path.exists(pdf_path):
        return jsonify({'error': 'File not found'}), 404

    split_dir = os.path.join(folder, 'split_output')
    os.makedirs(split_dir, exist_ok=True)

    try:
        if mode == 'all':
            outputs = split_pdf_all(pdf_path, split_dir)
            zip_bytes = create_zip_from_files(outputs)
            # Save zip to folder for download
            zip_path = os.path.join(folder, 'split_pages.zip')
            with open(zip_path, 'wb') as f:
                f.write(zip_bytes)
            return jsonify({
                'success': True,
                'download_type': 'zip',
                'file_count': len(outputs)
            })
        else:
            if not page_range:
                return jsonify({'error': 'Please specify page range'}), 400
            outputs = split_pdf_ranges(pdf_path, split_dir, page_range)
            # Copy to download location
            out_path = os.path.join(folder, 'split_result.pdf')
            with open(outputs[0], 'rb') as src, open(out_path, 'wb') as dst:
                dst.write(src.read())
            return jsonify({
                'success': True,
                'download_type': 'pdf',
                'file_count': 1
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def handle_split_download(folder):
    """Serve the split result (ZIP or PDF)."""
    zip_path = os.path.join(folder, 'split_pages.zip')
    pdf_path = os.path.join(folder, 'split_result.pdf')

    if os.path.exists(zip_path):
        with open(zip_path, 'rb') as f:
            data = f.read()
        return send_file(
            io.BytesIO(data),
            as_attachment=True,
            download_name='split_pages.zip',
            mimetype='application/zip'
        )
    elif os.path.exists(pdf_path):
        with open(pdf_path, 'rb') as f:
            data = f.read()
        return send_file(
            io.BytesIO(data),
            as_attachment=True,
            download_name='split_result.pdf',
            mimetype='application/pdf'
        )
    return jsonify({'error': 'No split result found'}), 404
