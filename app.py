import os
import sys
import uuid
import io
from flask import Flask, render_template, request, jsonify, send_file, session
from werkzeug.utils import secure_filename
from src.logger import logger
from src.utils import AppConfig, allowed_file
from src.components.pdf_operations import (
    convert_docx_to_pdf, get_pdf_page_count, merge_pdfs,
    encrypt_pdf, read_file_to_memory, cleanup_folder,
)
from src.components.file_handler import handle_upload, handle_remove, handle_merge

app = Flask(__name__)
app.secret_key = 'pdf-merger-secret-key-change-in-production'

config = AppConfig()
os.makedirs(config.upload_folder, exist_ok=True)
app.config['MAX_CONTENT_LENGTH'] = config.max_content_length


def get_session_folder():
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    folder = os.path.join(config.upload_folder, session['session_id'])
    os.makedirs(folder, exist_ok=True)
    return folder


@app.route('/')
def index():
    logger.info("Home page accessed")
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    return handle_upload(request, get_session_folder(), config)


@app.route('/remove', methods=['POST'])
def remove_file():
    return handle_remove(request, get_session_folder())


@app.route('/preview/<file_id>')
def preview_file(file_id):
    """Serve a PDF file for inline preview in the browser."""
    folder = get_session_folder()
    pdf_file = os.path.join(folder, f"{file_id}.pdf")
    if os.path.exists(pdf_file):
        return send_file(pdf_file, mimetype='application/pdf')
    return jsonify({'error': 'File not found'}), 404


@app.route('/merge', methods=['POST'])
def merge_files():
    return handle_merge(request, get_session_folder())


@app.route('/download-merged')
def download_merged():
    """Download the previously merged PDF and clean up."""
    folder = get_session_folder()
    # Check for protected first, then regular
    for name in ('merged_protected.pdf', 'merged_output.pdf'):
        path = os.path.join(folder, name)
        if os.path.exists(path):
            pdf_bytes = read_file_to_memory(path)
            cleanup_folder(folder)
            return send_file(
                io.BytesIO(pdf_bytes),
                as_attachment=True,
                download_name='merged.pdf',
                mimetype='application/pdf'
            )
    return jsonify({'error': 'No merged file found'}), 404


@app.route('/clear', methods=['POST'])
def clear_session():
    cleanup_folder(get_session_folder())
    return jsonify({'success': True})


if __name__ == '__main__':
    logger.info("Starting PDF Merger Flask application")
    os.makedirs("logs", exist_ok=True)
    app.run(debug=True, port=5000)
