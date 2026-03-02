import os
import sys
import uuid
import io
from flask import Flask, render_template, request, jsonify, send_file, session
from werkzeug.utils import secure_filename
from src.utils import AppConfig, allowed_file
from src.components.pdf_operations import (
    convert_docx_to_pdf, get_pdf_page_count, merge_pdfs,
    encrypt_pdf, read_file_to_memory, cleanup_folder,
)
from src.components.file_handler import handle_upload, handle_remove, handle_merge
from src.components.split_handler import handle_split_upload, handle_split, handle_split_download
from src.components.compress_handler import handle_compress_upload, handle_compress, handle_compress_download
from src.components.protect_handler import handle_protect_upload, handle_protect, handle_protect_download
from src.components.convert_handler import handle_convert_upload, handle_convert_download
from src.components.watermark_handler import handle_watermark_upload, handle_watermark, handle_watermark_download

app = Flask(__name__)
app.secret_key = 'pdf-merger-secret-key-change-in-production'
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True

config = AppConfig()
os.makedirs(config.upload_folder, exist_ok=True)
app.config['MAX_CONTENT_LENGTH'] = config.max_content_length


def get_session_folder():
    if 'session_id' not in session:
        session['session_id'] = str(uuid.uuid4())
    folder = os.path.join(config.upload_folder, session['session_id'])
    os.makedirs(folder, exist_ok=True)
    return folder


# ===== Home =====
@app.route('/')
def home():
    return render_template('home.html')


# ===== Merge PDF =====
@app.route('/merge')
def merge_page():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    return handle_upload(request, get_session_folder(), config)


@app.route('/remove', methods=['POST'])
def remove_file():
    return handle_remove(request, get_session_folder())


@app.route('/preview/<file_id>')
def preview_file(file_id):
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
    folder = get_session_folder()
    for name in ('merged_protected.pdf', 'merged_output.pdf'):
        path = os.path.join(folder, name)
        if os.path.exists(path):
            pdf_bytes = read_file_to_memory(path)
            return send_file(
                io.BytesIO(pdf_bytes),
                as_attachment=True,
                download_name='merged.pdf',
                mimetype='application/pdf'
            )
    return jsonify({'error': 'No merged file found'}), 404


@app.route('/merge/preview')
def merge_preview():
    folder = get_session_folder()
    for name in ('merged_output.pdf',):
        path = os.path.join(folder, name)
        if os.path.exists(path):
            return send_file(path, mimetype='application/pdf')
    return jsonify({'error': 'No merged file found'}), 404


@app.route('/clear', methods=['POST'])
def clear_session():
    cleanup_folder(get_session_folder())
    return jsonify({'success': True})


# ===== Split PDF =====
@app.route('/split')
def split_page():
    return render_template('split.html')


@app.route('/split/upload', methods=['POST'])
def split_upload():
    return handle_split_upload(request, get_session_folder(), config)


@app.route('/split/process', methods=['POST'])
def split_process():
    return handle_split(request, get_session_folder())


@app.route('/split/download')
def split_download():
    return handle_split_download(get_session_folder())


@app.route('/split/preview')
def split_preview():
    folder = get_session_folder()
    path = os.path.join(folder, 'split_result.pdf')
    if os.path.exists(path):
        return send_file(path, mimetype='application/pdf')
    return jsonify({'error': 'No split result found'}), 404


# ===== Compress PDF =====
@app.route('/compress')
def compress_page():
    return render_template('compress.html')


@app.route('/compress/upload', methods=['POST'])
def compress_upload():
    return handle_compress_upload(request, get_session_folder(), config)


@app.route('/compress/process', methods=['POST'])
def compress_process():
    return handle_compress(request, get_session_folder())


@app.route('/compress/download')
def compress_download():
    return handle_compress_download(get_session_folder())


@app.route('/compress/preview')
def compress_preview():
    folder = get_session_folder()
    path = os.path.join(folder, 'compressed_output.pdf')
    if os.path.exists(path):
        return send_file(path, mimetype='application/pdf')
    return jsonify({'error': 'No compressed file found'}), 404


# ===== Protect PDF =====
@app.route('/protect')
def protect_page():
    return render_template('protect.html')


@app.route('/protect/upload', methods=['POST'])
def protect_upload():
    return handle_protect_upload(request, get_session_folder(), config)


@app.route('/protect/process', methods=['POST'])
def protect_process():
    return handle_protect(request, get_session_folder())


@app.route('/protect/download')
def protect_download():
    return handle_protect_download(get_session_folder())


# ===== Convert to PDF =====
@app.route('/convert')
def convert_page():
    return render_template('convert.html')


@app.route('/convert/upload', methods=['POST'])
def convert_upload():
    return handle_convert_upload(request, get_session_folder(), config)


@app.route('/convert/preview/<file_id>')
def convert_preview(file_id):
    folder = get_session_folder()
    pdf_file = os.path.join(folder, f"{file_id}.pdf")
    if os.path.exists(pdf_file):
        return send_file(pdf_file, mimetype='application/pdf')
    return jsonify({'error': 'File not found'}), 404


@app.route('/convert/download/<file_id>')
def convert_download(file_id):
    return handle_convert_download(get_session_folder(), file_id)


# ===== Watermark PDF =====
@app.route('/watermark')
def watermark_page():
    return render_template('watermark.html')


@app.route('/watermark/upload', methods=['POST'])
def watermark_upload():
    return handle_watermark_upload(request, get_session_folder(), config)


@app.route('/watermark/process', methods=['POST'])
def watermark_process():
    return handle_watermark(request, get_session_folder())


@app.route('/watermark/download')
def watermark_download():
    return handle_watermark_download(get_session_folder())


@app.route('/watermark/preview')
def watermark_preview():
    folder = get_session_folder()
    path = os.path.join(folder, 'watermarked_output.pdf')
    if os.path.exists(path):
        return send_file(path, mimetype='application/pdf')
    return jsonify({'error': 'No watermarked file found'}), 404


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
