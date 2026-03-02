import os
import sys
import uuid
import io
from flask import jsonify, send_file
from src.components.compress_operations import compress_pdf
from src.components.pdf_operations import get_pdf_page_count


def handle_compress_upload(request, folder, config):
    """Handle single PDF upload for compression."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext != 'pdf':
        return jsonify({'error': 'Only PDF files can be compressed'}), 400

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(folder, f"{file_id}.pdf")
    file.save(saved_path)

    page_count = get_pdf_page_count(saved_path)
    file_size = os.path.getsize(saved_path)

    return jsonify({
        'id': file_id,
        'name': file.filename,
        'pages': page_count,
        'size': file_size
    })


def handle_compress(request, folder):
    """Compress the uploaded PDF."""
    data = request.get_json()
    file_id = data.get('file_id')
    quality = data.get('quality', 'medium')

    if not file_id:
        return jsonify({'error': 'No file specified'}), 400

    pdf_path = os.path.join(folder, f"{file_id}.pdf")
    if not os.path.exists(pdf_path):
        return jsonify({'error': 'File not found'}), 404

    output_path = os.path.join(folder, 'compressed_output.pdf')

    try:
        result = compress_pdf(pdf_path, output_path, quality)
        return jsonify({
            'success': True,
            'original_size': result['original_size'],
            'compressed_size': result['compressed_size'],
            'reduction_percent': result['reduction_percent']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def handle_compress_download(folder):
    """Serve the compressed PDF."""
    path = os.path.join(folder, 'compressed_output.pdf')
    if os.path.exists(path):
        with open(path, 'rb') as f:
            data = f.read()
        return send_file(
            io.BytesIO(data),
            as_attachment=True,
            download_name='compressed.pdf',
            mimetype='application/pdf'
        )
    return jsonify({'error': 'No compressed file found'}), 404
