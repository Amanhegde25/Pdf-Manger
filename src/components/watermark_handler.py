import os
import sys
import uuid
import io
from flask import jsonify, send_file
from src.logger import logger
from src.components.watermark_operations import add_text_watermark
from src.components.pdf_operations import get_pdf_page_count


def handle_watermark_upload(request, folder, config):
    """Handle single PDF upload for watermarking."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext != 'pdf':
        return jsonify({'error': 'Only PDF files can be watermarked'}), 400

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(folder, f"{file_id}.pdf")
    file.save(saved_path)
    logger.info(f"Watermark upload: {file.filename}")

    page_count = get_pdf_page_count(saved_path)

    return jsonify({
        'id': file_id,
        'name': file.filename,
        'pages': page_count
    })


def handle_watermark(request, folder):
    """Apply text watermark to the uploaded PDF."""
    data = request.get_json()
    file_id = data.get('file_id')
    text = data.get('text', '')
    opacity = float(data.get('opacity', 0.15))
    rotation = int(data.get('rotation', 45))

    if not file_id:
        return jsonify({'error': 'No file specified'}), 400
    if not text:
        return jsonify({'error': 'Watermark text is required'}), 400

    pdf_path = os.path.join(folder, f"{file_id}.pdf")
    if not os.path.exists(pdf_path):
        return jsonify({'error': 'File not found'}), 404

    output_path = os.path.join(folder, 'watermarked_output.pdf')

    try:
        add_text_watermark(pdf_path, output_path, text, opacity, rotation)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def handle_watermark_download(folder):
    """Serve the watermarked PDF."""
    path = os.path.join(folder, 'watermarked_output.pdf')
    if os.path.exists(path):
        with open(path, 'rb') as f:
            data = f.read()
        return send_file(
            io.BytesIO(data),
            as_attachment=True,
            download_name='watermarked.pdf',
            mimetype='application/pdf'
        )
    return jsonify({'error': 'No watermarked file found'}), 404
