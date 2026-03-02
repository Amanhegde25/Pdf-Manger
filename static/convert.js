// ===== Convert to PDF JS =====
let fileData = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileInfoCard = document.getElementById('fileInfoCard');
const resultCard = document.getElementById('resultCard');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); fileInput.value = ''; });

['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });

document.getElementById('removeFileBtn').addEventListener('click', resetState);
document.getElementById('downloadBtn').addEventListener('click', () => {
    if (fileData) window.location.href = `/convert/download/${fileData.id}`;
});
document.getElementById('previewBtn').addEventListener('click', () => {
    if (fileData) openPreview(`/convert/preview/${fileData.id}`, fileData.name);
});
document.getElementById('previewCloseBtn').addEventListener('click', closePreview);
document.getElementById('previewModal').addEventListener('click', (e) => {
    if (e.target.id === 'previewModal') closePreview();
});

async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'docx', 'doc'].includes(ext)) {
        showToast('Unsupported file type. Use JPG, PNG, or DOCX.', 'error');
        return;
    }

    showLoading('Converting...');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/convert/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        fileData = data;
        document.getElementById('fileName').textContent = data.name;
        document.getElementById('fileMeta').textContent = `Converted to PDF · ${data.pages} page${data.pages !== 1 ? 's' : ''}`;
        document.getElementById('resultText').textContent = `${data.name} converted to PDF successfully!`;

        dropzone.style.display = 'none';
        fileInfoCard.style.display = 'block';
        resultCard.style.display = 'block';
        showToast('File converted successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
    hideLoading();
}

function openPreview(url, title) {
    document.getElementById('previewTitle').textContent = title;
    document.getElementById('previewFrame').src = url;
    document.getElementById('previewModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closePreview() {
    document.getElementById('previewFrame').src = '';
    document.getElementById('previewModal').classList.remove('active');
    document.body.style.overflow = '';
}

function resetState() {
    fileData = null;
    dropzone.style.display = '';
    fileInfoCard.style.display = 'none';
    resultCard.style.display = 'none';
    fetch('/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
}

function showLoading(text) { loadingText.textContent = text || 'Processing...'; loadingOverlay.classList.add('active'); }
function hideLoading() { loadingOverlay.classList.remove('active'); }

function showToast(message, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}
