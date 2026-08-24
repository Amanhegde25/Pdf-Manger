import os
import uuid
import io
from flask import jsonify, send_file
from src.components.pdf_operations import get_pdf_page_count, merge_pdfs
from src.utils import allowed_file


def handle_editor_upload(request, folder, config):
    """Handle PDF upload for the editor. Returns file ID and page count."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext != 'pdf':
        return jsonify({'error': 'Only PDF files are supported in the editor'}), 400

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(folder, f"{file_id}.pdf")
    file.save(saved_path)

    page_count = get_pdf_page_count(saved_path)

    return jsonify({
        'id': file_id,
        'name': file.filename,
        'pages': page_count
    })


def handle_editor_add_pages(request, folder, config):
    """Handle uploading additional PDF pages to merge into the editor."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext != 'pdf':
        return jsonify({'error': 'Only PDF files can be added'}), 400

    file_id = str(uuid.uuid4())
    saved_path = os.path.join(folder, f"{file_id}.pdf")
    file.save(saved_path)

    page_count = get_pdf_page_count(saved_path)

    return jsonify({
        'id': file_id,
        'name': file.filename,
        'pages': page_count
    })


def handle_editor_save(request, folder):
    """Save the edited PDF blob sent from the client."""
    if 'pdf' not in request.files:
        return jsonify({'error': 'No PDF data provided'}), 400

    pdf_file = request.files['pdf']
    save_path = os.path.join(folder, 'editor_output.pdf')
    pdf_file.save(save_path)

    return jsonify({'success': True})


def handle_editor_download(folder):
    """Serve the saved edited PDF for download."""
    path = os.path.join(folder, 'editor_output.pdf')
    if os.path.exists(path):
        with open(path, 'rb') as f:
            data = f.read()
        return send_file(
            io.BytesIO(data),
            as_attachment=True,
            download_name='edited.pdf',
            mimetype='application/pdf'
        )
    return jsonify({'error': 'No edited file found'}), 404
