// ===== Protect PDF JS =====
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
const passwordInput = document.getElementById('passwordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); fileInput.value = ''; });

['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(ev => dropzone.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });

document.getElementById('removeFileBtn').addEventListener('click', resetState);
document.getElementById('protectBtn').addEventListener('click', protectPDF);
document.getElementById('downloadBtn').addEventListener('click', () => { window.location.href = '/protect/download'; });
document.getElementById('previewOrigBtn').addEventListener('click', () => {
    if (fileData) openPreview(`/preview/${fileData.id}`, fileData.name);
});
document.getElementById('previewCloseBtn').addEventListener('click', closePreview);
document.getElementById('previewModal').addEventListener('click', (e) => { if (e.target.id === 'previewModal') closePreview(); });

document.getElementById('togglePasswordBtn').addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    confirmPasswordInput.type = type;
    // Swap SVG icon
    const btn = document.getElementById('togglePasswordBtn');
    if (type === 'text') {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    } else {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
});

async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf') { showToast('Only PDF files are supported', 'error'); return; }

    showLoading('Uploading...');
    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/protect/upload', { method: 'POST', body: formData });
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

async function protectPDF() {
    if (!fileData) return;
    const password = passwordInput.value;
    const confirm = confirmPasswordInput.value;

    if (!password) { showToast('Please enter a password', 'error'); passwordInput.focus(); return; }
    if (password !== confirm) { showToast('Passwords do not match', 'error'); confirmPasswordInput.focus(); return; }

    showLoading('Protecting PDF...');
    try {
        const res = await fetch('/protect/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileData.id, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        actionSection.style.display = 'none';
        optionsPanel.style.display = 'none';
        resultCard.style.display = 'block';
        showToast('PDF protected successfully!', 'success');
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
    passwordInput.value = '';
    confirmPasswordInput.value = '';
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
