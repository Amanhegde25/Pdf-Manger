// ===== Watermark PDF JS =====
let fileData = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileInfoCard = document.getElementById('fileInfoCard');
const optionsPanel = document.getElementById('optionsPanel');
const actionSection = document.getElementById('actionSection');
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
document.getElementById('watermarkBtn').addEventListener('click', applyWatermark);
document.getElementById('downloadBtn').addEventListener('click', () => { window.location.href = '/watermark/download'; });
document.getElementById('previewOrigBtn').addEventListener('click', () => {
    if (fileData) openPreview(`/preview/${fileData.id}`, fileData.name);
});
document.getElementById('previewResultBtn').addEventListener('click', () => {
    openPreview('/watermark/preview', 'Watermarked PDF');
});
document.getElementById('adjustBtn').addEventListener('click', () => {
    resultCard.style.display = 'none';
    optionsPanel.style.display = 'block';
    actionSection.style.display = 'block';
});
document.getElementById('previewCloseBtn').addEventListener('click', closePreview);
document.getElementById('previewModal').addEventListener('click', (e) => { if (e.target.id === 'previewModal') closePreview(); });

async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') { showToast('Only PDF files are supported', 'error'); return; }

    showLoading('Uploading...');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/watermark/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        fileData = data;
        document.getElementById('fileName').textContent = data.name;
        document.getElementById('fileMeta').textContent = `${data.pages} page${data.pages !== 1 ? 's' : ''}`;

        dropzone.style.display = 'none';
        fileInfoCard.style.display = 'block';
        optionsPanel.style.display = 'block';
        actionSection.style.display = 'block';
        resultCard.style.display = 'none';
    } catch (err) {
        showToast(err.message, 'error');
    }
    hideLoading();
}

async function applyWatermark() {
    if (!fileData) return;
    const text = document.getElementById('watermarkText').value;
    const opacity = document.getElementById('opacitySelect').value;
    const rotation = document.getElementById('rotationSelect').value;

    if (!text.trim()) { showToast('Please enter watermark text', 'error'); return; }

    showLoading('Adding watermark...');
    try {
        const res = await fetch('/watermark/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileData.id, text, opacity, rotation })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        actionSection.style.display = 'none';
        optionsPanel.style.display = 'none';
        resultCard.style.display = 'block';
        showToast('Watermark added successfully!', 'success');
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
    optionsPanel.style.display = 'none';
    actionSection.style.display = 'none';
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
