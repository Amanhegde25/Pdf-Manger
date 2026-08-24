/**
 * PDF Editor — Main JavaScript Module
 *
 * Orchestrates: PDF.js rendering, Fabric.js canvas editing,
 * page management (thumbnails, reorder, delete, add),
 * undo/redo history, and pdf-lib export.
 */

// ─── PDF.js Setup ───────────────────────────────────────────────
const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

const { PDFDocument } = PDFLib; // pdf-lib global

// ─── State ──────────────────────────────────────────────────────
const state = {
    pdfDoc: null,           // PDF.js document
    pdfBytes: null,         // Raw ArrayBuffer of current PDF
    pages: [],              // Array of { pageIndex, sourceFileIndex, deleted }
    sourceFiles: [],        // Array of { bytes: Uint8Array, pdfDoc: PDFDocument }
    currentPage: 0,         // 0-indexed in pages[]
    zoom: 1.0,
    currentTool: 'select',
    currentShape: 'rect',
    fabricCanvas: null,
    annotations: new Map(), // pageIndex -> fabric JSON
    history: new Map(),     // pageIndex -> { states:[], pointer }
    maxHistory: 50,
    isDrawingShape: false,
    shapeStartX: 0,
    shapeStartY: 0,
    activeShapeObj: null,
};

// ─── DOM References ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const els = {
    editorPage: $('editorPage'),
    emptyState: $('emptyState'),
    canvasWrapper: $('canvasWrapper'),
    canvasArea: $('canvasArea'),
    pdfRenderCanvas: $('pdfRenderCanvas'),
    fabricCanvasEl: $('fabricCanvas'),
    sidebar: $('editorSidebar'),
    thumbnailList: $('thumbnailList'),
    properties: $('editorProperties'),
    bottombar: $('editorBottombar'),
    toolbar: $('editorToolbar'),
    loading: $('editorLoading'),
    loadingText: $('loadingText'),
    toast: $('editorToast'),
    editorDropzone: $('editorDropzone'),
    editorFileInput: $('editorFileInput'),
    imageFileInput: $('imageFileInput'),
    addPagesInput: $('addPagesInput'),
    zoomLabel: $('zoomLabel'),
    pageNavInput: $('pageNavInput'),
    totalPagesLabel: $('totalPagesLabel'),
    btnPrevPage: $('btnPrevPage'),
    btnNextPage: $('btnNextPage'),
    btnUndo: $('btnUndo'),
    btnRedo: $('btnRedo'),
    btnZoomIn: $('btnZoomIn'),
    btnZoomOut: $('btnZoomOut'),
    btnDownload: $('btnDownload'),
    btnAddPages: $('btnAddPages'),
    btnDeleteObject: $('btnDeleteObject'),
    signatureModal: $('signatureModal'),
    signatureCanvas: $('signatureCanvas'),
    sigClear: $('sigClear'),
    sigCancel: $('sigCancel'),
    sigApply: $('sigApply'),
    shapeSubmenu: $('shapeSubmenu'),
    // Property inputs
    propsFontSize: $('propsFontSize'),
    propsTextColor: $('propsTextColor'),
    propsFontFamily: $('propsFontFamily'),
    propsBold: $('propsBold'),
    propsItalic: $('propsItalic'),
    propsBrushSize: $('propsBrushSize'),
    propsDrawColor: $('propsDrawColor'),
    propsDrawOpacity: $('propsDrawOpacity'),
    propsHighlightColor: $('propsHighlightColor'),
    propsHighlightOpacity: $('propsHighlightOpacity'),
    propsShapeFill: $('propsShapeFill'),
    propsShapeStroke: $('propsShapeStroke'),
    propsShapeStrokeWidth: $('propsShapeStrokeWidth'),
    propsShapeOpacity: $('propsShapeOpacity'),
    // Property panels
    propsText: $('propsText'),
    propsDraw: $('propsDraw'),
    propsHighlight: $('propsHighlight'),
    propsShape: $('propsShape'),
    propsSelected: $('propsSelected'),
};

// ─── Toast Helper ───────────────────────────────────────────────
function showToast(msg, type = 'info') {
    els.toast.textContent = msg;
    els.toast.className = 'editor-toast ' + type;
    setTimeout(() => els.toast.classList.add('show'), 10);
    setTimeout(() => els.toast.classList.remove('show'), 3000);
}

function showLoading(text = 'Loading PDF…') {
    els.loadingText.textContent = text;
    els.loading.classList.add('active');
}
function hideLoading() {
    els.loading.classList.remove('active');
}

// ─── Initialize Fabric.js ───────────────────────────────────────
function initFabricCanvas(w, h) {
    if (state.fabricCanvas) {
        state.fabricCanvas.dispose();
    }
    state.fabricCanvas = new fabric.Canvas('fabricCanvas', {
        width: w,
        height: h,
        selection: true,
        preserveObjectStacking: true,
    });

    state.fabricCanvas.on('object:added', () => saveHistory());
    state.fabricCanvas.on('object:modified', () => saveHistory());
    state.fabricCanvas.on('object:removed', () => saveHistory());

    state.fabricCanvas.on('selection:created', onObjectSelected);
    state.fabricCanvas.on('selection:updated', onObjectSelected);
    state.fabricCanvas.on('selection:cleared', onObjectDeselected);

    // Shape drawing events
    state.fabricCanvas.on('mouse:down', onCanvasMouseDown);
    state.fabricCanvas.on('mouse:move', onCanvasMouseMove);
    state.fabricCanvas.on('mouse:up', onCanvasMouseUp);
}

// ─── PDF Loading ────────────────────────────────────────────────
async function loadPDF(fileBytes, appendMode = false) {
    showLoading('Rendering PDF…');

    const bytes = new Uint8Array(fileBytes);
    const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
    const pdfDoc = await loadingTask.promise;

    // Store as a source file for pdf-lib export
    const sourceIndex = state.sourceFiles.length;
    state.sourceFiles.push({ bytes: bytes });

    if (!appendMode) {
        state.pdfDoc = pdfDoc;
        state.pdfBytes = bytes;
        state.pages = [];
        state.annotations.clear();
        state.history.clear();
        state.currentPage = 0;
    }

    // Add pages
    const startLen = state.pages.length;
    for (let i = 0; i < pdfDoc.numPages; i++) {
        state.pages.push({
            pageIndex: i,
            sourceFileIndex: sourceIndex,
            deleted: false,
            pdfDoc: pdfDoc,
        });
    }

    // Show the editor UI
    els.emptyState.style.display = 'none';
    els.canvasWrapper.style.display = 'block';
    els.sidebar.style.display = 'flex';
    els.properties.style.display = 'flex';
    els.bottombar.style.display = 'flex';
    els.btnDownload.disabled = false;

    if (!appendMode) {
        state.currentPage = 0;
    }

    await renderCurrentPage();
    renderThumbnails();
    updatePageNav();
    initSortable();
    hideLoading();

    if (appendMode) {
        showToast(`Added ${pdfDoc.numPages} page(s)`, 'success');
    } else {
        showToast('PDF loaded successfully', 'success');
    }
}

// ─── Render Current Page ────────────────────────────────────────
async function renderCurrentPage() {
    const pageData = getActivePages()[state.currentPage];
    if (!pageData) return;

    const pdfDoc = pageData.pdfDoc;
    const page = await pdfDoc.getPage(pageData.pageIndex + 1); // PDF.js is 1-indexed
    const viewport = page.getViewport({ scale: state.zoom * 1.5 }); // 1.5x for sharpness

    const canvas = els.pdfRenderCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = viewport.width / 1.5 + 'px';
    canvas.style.height = viewport.height / 1.5 + 'px';

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Size the fabric canvas to match the display size
    const displayW = viewport.width / 1.5;
    const displayH = viewport.height / 1.5;

    // Save current annotations before switching
    saveCurrentAnnotations();

    initFabricCanvas(displayW, displayH);

    // Position fabric canvas overlaid on the PDF canvas
    els.fabricCanvasEl.style.position = 'absolute';
    els.fabricCanvasEl.style.top = '0';
    els.fabricCanvasEl.style.left = '0';
    els.canvasWrapper.style.width = displayW + 'px';
    els.canvasWrapper.style.height = displayH + 'px';
    els.canvasWrapper.style.position = 'relative';

    // Restore annotations for this page
    loadAnnotationsForPage(state.currentPage);

    // Apply current tool mode
    applyToolMode();

    // Update thumbnail active state
    updateThumbnailActive();

    // Initialize history for this page if needed
    const globalIdx = getGlobalPageIndex(state.currentPage);
    if (!state.history.has(globalIdx)) {
        state.history.set(globalIdx, { states: [], pointer: -1 });
        saveHistory();
    }

    updateUndoRedoButtons();
}

function getActivePages() {
    return state.pages.filter(p => !p.deleted);
}

function getGlobalPageIndex(activeIdx) {
    const activePages = getActivePages();
    if (activeIdx < 0 || activeIdx >= activePages.length) return -1;
    return state.pages.indexOf(activePages[activeIdx]);
}

// ─── Annotations Save/Load ──────────────────────────────────────
function saveCurrentAnnotations() {
    if (!state.fabricCanvas) return;
    const globalIdx = getGlobalPageIndex(state.currentPage);
    if (globalIdx >= 0) {
        state.annotations.set(globalIdx, state.fabricCanvas.toJSON());
    }
}

function loadAnnotationsForPage(activePageIdx) {
    const globalIdx = getGlobalPageIndex(activePageIdx);
    if (globalIdx >= 0 && state.annotations.has(globalIdx)) {
        const json = state.annotations.get(globalIdx);
        state.fabricCanvas.loadFromJSON(json, () => {
            state.fabricCanvas.renderAll();
        });
    }
}

// ─── History (Undo/Redo) ────────────────────────────────────────
function saveHistory() {
    const globalIdx = getGlobalPageIndex(state.currentPage);
    if (globalIdx < 0 || !state.fabricCanvas) return;

    if (!state.history.has(globalIdx)) {
        state.history.set(globalIdx, { states: [], pointer: -1 });
    }

    const h = state.history.get(globalIdx);
    const json = JSON.stringify(state.fabricCanvas.toJSON());

    // If we're not at the end, truncate forward history
    if (h.pointer < h.states.length - 1) {
        h.states = h.states.slice(0, h.pointer + 1);
    }

    h.states.push(json);
    if (h.states.length > state.maxHistory) {
        h.states.shift();
    }
    h.pointer = h.states.length - 1;

    updateUndoRedoButtons();
}

function undo() {
    const globalIdx = getGlobalPageIndex(state.currentPage);
    if (globalIdx < 0) return;
    const h = state.history.get(globalIdx);
    if (!h || h.pointer <= 0) return;

    h.pointer--;
    const json = JSON.parse(h.states[h.pointer]);
    state.fabricCanvas.loadFromJSON(json, () => {
        state.fabricCanvas.renderAll();
        updateUndoRedoButtons();
    });
}

function redo() {
    const globalIdx = getGlobalPageIndex(state.currentPage);
    if (globalIdx < 0) return;
    const h = state.history.get(globalIdx);
    if (!h || h.pointer >= h.states.length - 1) return;

    h.pointer++;
    const json = JSON.parse(h.states[h.pointer]);
    state.fabricCanvas.loadFromJSON(json, () => {
        state.fabricCanvas.renderAll();
        updateUndoRedoButtons();
    });
}

function updateUndoRedoButtons() {
    const globalIdx = getGlobalPageIndex(state.currentPage);
    const h = state.history.get(globalIdx);
    els.btnUndo.disabled = !h || h.pointer <= 0;
    els.btnRedo.disabled = !h || h.pointer >= h.states.length - 1;
}

// ─── Thumbnails ─────────────────────────────────────────────────
async function renderThumbnails() {
    els.thumbnailList.innerHTML = '';
    const activePages = getActivePages();

    for (let i = 0; i < activePages.length; i++) {
        const pageData = activePages[i];
        const page = await pageData.pdfDoc.getPage(pageData.pageIndex + 1);
        const viewport = page.getViewport({ scale: 0.3 });

        const item = document.createElement('div');
        item.className = 'thumbnail-item' + (i === state.currentPage ? ' active' : '');
        item.dataset.pageIndex = i;

        const canvas = document.createElement('canvas');
        canvas.className = 'thumbnail-canvas';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const label = document.createElement('span');
        label.className = 'thumbnail-label';
        label.textContent = i + 1;

        const delBtn = document.createElement('button');
        delBtn.className = 'thumbnail-delete';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deletePage(i);
        });

        item.appendChild(canvas);
        item.appendChild(label);
        item.appendChild(delBtn);

        item.addEventListener('click', () => goToPage(i));
        els.thumbnailList.appendChild(item);
    }
}

function updateThumbnailActive() {
    const items = els.thumbnailList.querySelectorAll('.thumbnail-item');
    items.forEach((item, i) => {
        item.classList.toggle('active', i === state.currentPage);
    });
}

let sortableInstance = null;

function initSortable() {
    if (sortableInstance) sortableInstance.destroy();

    sortableInstance = new Sortable(els.thumbnailList, {
        animation: 200,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        onEnd: async (evt) => {
            const oldIdx = evt.oldIndex;
            const newIdx = evt.newIndex;
            if (oldIdx === newIdx) return;

            // Reorder in the pages array
            const activePages = getActivePages();
            const activeGlobalIndices = activePages.map(p => state.pages.indexOf(p));

            const movedGlobalIdx = activeGlobalIndices[oldIdx];
            const movedPage = state.pages[movedGlobalIdx];

            // Remove from old position
            state.pages.splice(movedGlobalIdx, 1);

            // Calculate new global position
            const newActivePages = state.pages.filter(p => !p.deleted);
            let insertGlobalIdx;
            if (newIdx >= newActivePages.length) {
                insertGlobalIdx = state.pages.length;
            } else {
                insertGlobalIdx = state.pages.indexOf(newActivePages[newIdx]);
            }

            state.pages.splice(insertGlobalIdx, 0, movedPage);

            // Adjust current page
            if (state.currentPage === oldIdx) {
                state.currentPage = newIdx;
            } else if (oldIdx < state.currentPage && newIdx >= state.currentPage) {
                state.currentPage--;
            } else if (oldIdx > state.currentPage && newIdx <= state.currentPage) {
                state.currentPage++;
            }

            await renderCurrentPage();
            updatePageNav();
            showToast('Page reordered', 'info');
        }
    });
}

// ─── Page Operations ────────────────────────────────────────────
async function deletePage(activeIdx) {
    const activePages = getActivePages();
    if (activePages.length <= 1) {
        showToast('Cannot delete the last page', 'error');
        return;
    }

    const globalIdx = state.pages.indexOf(activePages[activeIdx]);
    state.pages[globalIdx].deleted = true;

    // Adjust current page
    const newActive = getActivePages();
    if (state.currentPage >= newActive.length) {
        state.currentPage = newActive.length - 1;
    }

    await renderCurrentPage();
    renderThumbnails();
    updatePageNav();
    showToast('Page deleted', 'info');
}

async function goToPage(activeIdx) {
    if (activeIdx < 0 || activeIdx >= getActivePages().length) return;
    saveCurrentAnnotations();
    state.currentPage = activeIdx;
    await renderCurrentPage();
    updatePageNav();
}

function updatePageNav() {
    const total = getActivePages().length;
    els.totalPagesLabel.textContent = total;
    els.pageNavInput.value = state.currentPage + 1;
    els.pageNavInput.max = total;
    els.btnPrevPage.disabled = state.currentPage <= 0;
    els.btnNextPage.disabled = state.currentPage >= total - 1;
}

// ─── Tool Mode ──────────────────────────────────────────────────
function setTool(tool) {
    state.currentTool = tool;

    // Update tool button active states
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    // Show shape submenu only for shape tool
    if (tool !== 'shape') {
        els.shapeSubmenu.classList.remove('active');
    }

    // Show relevant properties panel
    els.propsText.style.display = tool === 'text' ? 'block' : 'none';
    els.propsDraw.style.display = tool === 'draw' ? 'block' : 'none';
    els.propsHighlight.style.display = tool === 'highlight' ? 'block' : 'none';
    els.propsShape.style.display = tool === 'shape' ? 'block' : 'none';

    applyToolMode();
}

function applyToolMode() {
    if (!state.fabricCanvas) return;

    const fc = state.fabricCanvas;

    // Reset drawing mode
    fc.isDrawingMode = false;
    fc.selection = true;
    fc.defaultCursor = 'default';
    fc.hoverCursor = 'move';

    // Disable object interactivity for draw modes
    fc.forEachObject(o => {
        o.selectable = state.currentTool === 'select';
        o.evented = state.currentTool === 'select';
    });

    switch (state.currentTool) {
        case 'select':
            fc.selection = true;
            break;

        case 'text':
            fc.selection = false;
            fc.defaultCursor = 'text';
            fc.hoverCursor = 'text';
            break;

        case 'draw':
            fc.isDrawingMode = true;
            fc.freeDrawingBrush.width = parseInt(els.propsBrushSize.value);
            fc.freeDrawingBrush.color = hexToRGBA(els.propsDrawColor.value, parseFloat(els.propsDrawOpacity.value));
            break;

        case 'highlight':
            fc.selection = false;
            fc.defaultCursor = 'crosshair';
            fc.hoverCursor = 'crosshair';
            break;

        case 'image':
            els.imageFileInput.click();
            setTool('select');
            break;

        case 'shape':
            fc.selection = false;
            fc.defaultCursor = 'crosshair';
            fc.hoverCursor = 'crosshair';
            break;

        case 'signature':
            openSignatureModal();
            break;
    }
}

// ─── Canvas Mouse Events (for shapes, highlights, text placement) ─
function onCanvasMouseDown(opt) {
    if (!state.fabricCanvas) return;
    const pointer = state.fabricCanvas.getPointer(opt.e);

    if (state.currentTool === 'text') {
        addTextAtPosition(pointer.x, pointer.y);
        return;
    }

    if (state.currentTool === 'highlight' || state.currentTool === 'shape') {
        state.isDrawingShape = true;
        state.shapeStartX = pointer.x;
        state.shapeStartY = pointer.y;

        let obj;
        if (state.currentTool === 'highlight') {
            obj = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 0,
                height: 0,
                fill: hexToRGBA(els.propsHighlightColor.value, parseFloat(els.propsHighlightOpacity.value)),
                stroke: 'transparent',
                strokeWidth: 0,
                selectable: false,
                evented: false,
                opacity: 1,
            });
        } else if (state.currentShape === 'rect') {
            obj = new fabric.Rect({
                left: pointer.x,
                top: pointer.y,
                width: 0,
                height: 0,
                fill: hexToRGBA(els.propsShapeFill.value, parseFloat(els.propsShapeOpacity.value)),
                stroke: els.propsShapeStroke.value,
                strokeWidth: parseInt(els.propsShapeStrokeWidth.value),
                selectable: false,
                evented: false,
            });
        } else if (state.currentShape === 'circle') {
            obj = new fabric.Ellipse({
                left: pointer.x,
                top: pointer.y,
                rx: 0,
                ry: 0,
                fill: hexToRGBA(els.propsShapeFill.value, parseFloat(els.propsShapeOpacity.value)),
                stroke: els.propsShapeStroke.value,
                strokeWidth: parseInt(els.propsShapeStrokeWidth.value),
                selectable: false,
                evented: false,
            });
        } else if (state.currentShape === 'line' || state.currentShape === 'arrow') {
            obj = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                stroke: els.propsShapeStroke.value,
                strokeWidth: parseInt(els.propsShapeStrokeWidth.value),
                selectable: false,
                evented: false,
                opacity: parseFloat(els.propsShapeOpacity.value),
            });
        }

        if (obj) {
            state.fabricCanvas.add(obj);
            state.activeShapeObj = obj;
        }
    }
}

function onCanvasMouseMove(opt) {
    if (!state.isDrawingShape || !state.activeShapeObj) return;
    const pointer = state.fabricCanvas.getPointer(opt.e);

    const obj = state.activeShapeObj;
    const sx = state.shapeStartX;
    const sy = state.shapeStartY;

    if (obj.type === 'rect') {
        const left = Math.min(sx, pointer.x);
        const top = Math.min(sy, pointer.y);
        obj.set({
            left: left,
            top: top,
            width: Math.abs(pointer.x - sx),
            height: Math.abs(pointer.y - sy),
        });
    } else if (obj.type === 'ellipse') {
        const left = Math.min(sx, pointer.x);
        const top = Math.min(sy, pointer.y);
        obj.set({
            left: left,
            top: top,
            rx: Math.abs(pointer.x - sx) / 2,
            ry: Math.abs(pointer.y - sy) / 2,
        });
    } else if (obj.type === 'line') {
        obj.set({ x2: pointer.x, y2: pointer.y });
    }

    state.fabricCanvas.renderAll();
}

function onCanvasMouseUp(opt) {
    if (!state.isDrawingShape || !state.activeShapeObj) return;

    state.isDrawingShape = false;

    // If shape is for an arrow, add arrowhead
    if (state.currentTool === 'shape' && state.currentShape === 'arrow' && state.activeShapeObj.type === 'line') {
        addArrowHead(state.activeShapeObj);
    }

    // Make selectable after creation
    state.activeShapeObj.set({ selectable: false, evented: false });
    state.activeShapeObj = null;

    state.fabricCanvas.renderAll();
}

function addArrowHead(line) {
    const x1 = line.x1, y1 = line.y1, x2 = line.x2, y2 = line.y2;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 15;

    const triangle = new fabric.Triangle({
        left: x2,
        top: y2,
        width: headLen,
        height: headLen,
        fill: line.stroke,
        angle: (angle * 180 / Math.PI) + 90,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false,
        opacity: line.opacity,
    });

    state.fabricCanvas.add(triangle);
}

// ─── Text Tool ──────────────────────────────────────────────────
function addTextAtPosition(x, y) {
    const textbox = new fabric.IText('Type here', {
        left: x,
        top: y,
        fontSize: parseInt(els.propsFontSize.value),
        fill: els.propsTextColor.value,
        fontFamily: els.propsFontFamily.value,
        fontWeight: els.propsBold.classList.contains('active') ? 'bold' : 'normal',
        fontStyle: els.propsItalic.classList.contains('active') ? 'italic' : 'normal',
        editable: true,
        selectable: true,
        evented: true,
    });

    state.fabricCanvas.add(textbox);
    state.fabricCanvas.setActiveObject(textbox);
    textbox.enterEditing();
    textbox.selectAll();
    state.fabricCanvas.renderAll();

    // Switch back to select mode so user can edit the text
    setTool('select');
}

// ─── Image Tool ─────────────────────────────────────────────────
function addImageToCanvas(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        fabric.Image.fromURL(e.target.result, (img) => {
            // Scale to fit within canvas
            const maxW = state.fabricCanvas.width * 0.5;
            const maxH = state.fabricCanvas.height * 0.5;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);

            img.set({
                left: 50,
                top: 50,
                scaleX: scale,
                scaleY: scale,
            });

            state.fabricCanvas.add(img);
            state.fabricCanvas.setActiveObject(img);
            state.fabricCanvas.renderAll();
            showToast('Image added', 'success');
        });
    };
    reader.readAsDataURL(file);
}

// ─── Signature ──────────────────────────────────────────────────
let sigCtx = null;
let sigDrawing = false;
let sigPoints = [];

function openSignatureModal() {
    els.signatureModal.classList.add('active');
    sigCtx = els.signatureCanvas.getContext('2d');
    clearSignatureCanvas();
    setTool('select'); // Reset tool so it doesn't loop
}

function clearSignatureCanvas() {
    if (!sigCtx) return;
    sigCtx.clearRect(0, 0, els.signatureCanvas.width, els.signatureCanvas.height);
    sigPoints = [];
}

function initSignatureEvents() {
    const canvas = els.signatureCanvas;

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || e.touches[0].clientX) - rect.left;
        const y = (e.clientY || e.touches[0].clientY) - rect.top;
        return { x, y };
    };

    const startDraw = (e) => {
        e.preventDefault();
        sigDrawing = true;
        sigCtx.beginPath();
        const pos = getPos(e);
        sigCtx.moveTo(pos.x, pos.y);
        sigPoints.push(pos);
    };

    const draw = (e) => {
        if (!sigDrawing) return;
        e.preventDefault();
        const pos = getPos(e);
        sigCtx.strokeStyle = '#1a1a2e';
        sigCtx.lineWidth = 2.5;
        sigCtx.lineCap = 'round';
        sigCtx.lineJoin = 'round';
        sigCtx.lineTo(pos.x, pos.y);
        sigCtx.stroke();
        sigPoints.push(pos);
    };

    const endDraw = () => {
        sigDrawing = false;
    };

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', endDraw);
}

function applySignature() {
    if (sigPoints.length < 5) {
        showToast('Please draw a signature first', 'error');
        return;
    }

    const dataURL = els.signatureCanvas.toDataURL('image/png');
    fabric.Image.fromURL(dataURL, (img) => {
        const scale = Math.min(200 / img.width, 80 / img.height, 1);
        img.set({
            left: 100,
            top: state.fabricCanvas.height - 120,
            scaleX: scale,
            scaleY: scale,
        });
        state.fabricCanvas.add(img);
        state.fabricCanvas.setActiveObject(img);
        state.fabricCanvas.renderAll();
    });

    els.signatureModal.classList.remove('active');
    showToast('Signature added', 'success');
}

// ─── Object Selection Events ────────────────────────────────────
function onObjectSelected() {
    els.propsSelected.style.display = 'block';
}

function onObjectDeselected() {
    els.propsSelected.style.display = 'none';
}

// ─── Zoom ───────────────────────────────────────────────────────
const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

function zoomIn() {
    const idx = ZOOM_LEVELS.indexOf(state.zoom);
    if (idx < ZOOM_LEVELS.length - 1) {
        state.zoom = ZOOM_LEVELS[idx + 1];
        onZoomChange();
    }
}

function zoomOut() {
    const idx = ZOOM_LEVELS.indexOf(state.zoom);
    if (idx > 0) {
        state.zoom = ZOOM_LEVELS[idx - 1];
        onZoomChange();
    }
}

async function onZoomChange() {
    els.zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    saveCurrentAnnotations();
    await renderCurrentPage();
}

// ─── Export (pdf-lib) ───────────────────────────────────────────
async function exportPDF() {
    showLoading('Building your PDF…');

    try {
        saveCurrentAnnotations();

        const outputPdf = await PDFDocument.create();
        const activePages = getActivePages();

        for (let i = 0; i < activePages.length; i++) {
            const pageData = activePages[i];
            const sourceBytes = state.sourceFiles[pageData.sourceFileIndex].bytes;
            const sourcePdf = await PDFDocument.load(sourceBytes);
            const [copiedPage] = await outputPdf.copyPages(sourcePdf, [pageData.pageIndex]);
            const addedPage = outputPdf.addPage(copiedPage);

            // Check for annotations on this page
            const globalIdx = state.pages.indexOf(pageData);
            if (state.annotations.has(globalIdx)) {
                const json = state.annotations.get(globalIdx);
                if (json && json.objects && json.objects.length > 0) {
                    // Render annotations to an image
                    const annotImage = await renderAnnotationsToImage(json, addedPage.getWidth(), addedPage.getHeight());
                    if (annotImage) {
                        const pngImage = await outputPdf.embedPng(annotImage);
                        addedPage.drawImage(pngImage, {
                            x: 0,
                            y: 0,
                            width: addedPage.getWidth(),
                            height: addedPage.getHeight(),
                        });
                    }
                }
            }
        }

        const pdfBytes = await outputPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'edited.pdf';
        a.click();
        URL.revokeObjectURL(url);

        hideLoading();
        showToast('PDF downloaded successfully!', 'success');
    } catch (err) {
        hideLoading();
        console.error('Export error:', err);
        showToast('Export failed: ' + err.message, 'error');
    }
}

async function renderAnnotationsToImage(fabricJSON, pageW, pageH) {
    return new Promise((resolve) => {
        // Create a temporary canvas matching the PDF page size
        const tempCanvasEl = document.createElement('canvas');
        tempCanvasEl.width = pageW * 2; // 2x for quality
        tempCanvasEl.height = pageH * 2;

        const tempFabric = new fabric.StaticCanvas(tempCanvasEl, {
            width: pageW * 2,
            height: pageH * 2,
            backgroundColor: 'transparent',
        });

        tempFabric.loadFromJSON(fabricJSON, () => {
            // Scale all objects to map from display coords to PDF page coords
            const scaleX = (pageW * 2) / fabricJSON.width;
            const scaleY = (pageH * 2) / fabricJSON.height;

            tempFabric.getObjects().forEach(obj => {
                obj.set({
                    left: obj.left * scaleX,
                    top: obj.top * scaleY,
                    scaleX: (obj.scaleX || 1) * scaleX,
                    scaleY: (obj.scaleY || 1) * scaleY,
                });
                obj.setCoords();
            });

            tempFabric.renderAll();

            // Export as PNG data URL
            const dataURL = tempFabric.toDataURL({ format: 'png', multiplier: 1 });

            // Convert data URL to Uint8Array
            const base64 = dataURL.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            tempFabric.dispose();
            resolve(bytes);
        });
    });
}

// ─── Utility ────────────────────────────────────────────────────
function hexToRGBA(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Event Bindings ─────────────────────────────────────────────
function bindEvents() {
    // File upload — dropzone
    els.editorDropzone.addEventListener('click', () => els.editorFileInput.click());
    els.editorDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        els.editorDropzone.classList.add('dragover');
    });
    els.editorDropzone.addEventListener('dragleave', () => {
        els.editorDropzone.classList.remove('dragover');
    });
    els.editorDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        els.editorDropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            file.arrayBuffer().then(buf => loadPDF(buf));
        } else {
            showToast('Please drop a PDF file', 'error');
        }
    });

    els.editorFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) file.arrayBuffer().then(buf => loadPDF(buf));
        e.target.value = '';
    });

    // Add pages
    els.btnAddPages.addEventListener('click', () => els.addPagesInput.click());
    els.addPagesInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) file.arrayBuffer().then(buf => loadPDF(buf, true));
        e.target.value = '';
    });

    // Image upload
    els.imageFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) addImageToCanvas(file);
        e.target.value = '';
    });

    // Tool buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => setTool(btn.dataset.tool));
    });

    // Shape submenu
    const toolShapeBtn = document.querySelector('[data-tool="shape"]');
    toolShapeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.shapeSubmenu.classList.toggle('active');
    });
    document.querySelectorAll('.shape-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.shape-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            state.currentShape = opt.dataset.shape;
            els.shapeSubmenu.classList.remove('active');
            setTool('shape');
        });
    });

    // Close shape submenu on outside click
    document.addEventListener('click', () => {
        els.shapeSubmenu.classList.remove('active');
    });

    // Page navigation
    els.btnPrevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
    els.btnNextPage.addEventListener('click', () => goToPage(state.currentPage + 1));
    els.pageNavInput.addEventListener('change', () => {
        const val = parseInt(els.pageNavInput.value) - 1;
        if (!isNaN(val)) goToPage(val);
    });

    // Undo / Redo
    els.btnUndo.addEventListener('click', undo);
    els.btnRedo.addEventListener('click', redo);

    // Zoom
    els.btnZoomIn.addEventListener('click', zoomIn);
    els.btnZoomOut.addEventListener('click', zoomOut);

    // Download
    els.btnDownload.addEventListener('click', exportPDF);

    // Delete selected object
    els.btnDeleteObject.addEventListener('click', () => {
        const active = state.fabricCanvas.getActiveObject();
        if (active) {
            state.fabricCanvas.remove(active);
            state.fabricCanvas.discardActiveObject();
            state.fabricCanvas.renderAll();
        }
    });

    // Signature
    els.sigClear.addEventListener('click', clearSignatureCanvas);
    els.sigCancel.addEventListener('click', () => els.signatureModal.classList.remove('active'));
    els.sigApply.addEventListener('click', applySignature);
    initSignatureEvents();

    // Text property changes
    els.propsFontSize.addEventListener('change', updateSelectedTextProps);
    els.propsTextColor.addEventListener('input', updateSelectedTextProps);
    els.propsFontFamily.addEventListener('change', updateSelectedTextProps);
    els.propsBold.addEventListener('click', () => {
        els.propsBold.classList.toggle('active');
        updateSelectedTextProps();
    });
    els.propsItalic.addEventListener('click', () => {
        els.propsItalic.classList.toggle('active');
        updateSelectedTextProps();
    });

    // Draw property changes
    els.propsBrushSize.addEventListener('change', () => {
        if (state.fabricCanvas && state.fabricCanvas.isDrawingMode) {
            state.fabricCanvas.freeDrawingBrush.width = parseInt(els.propsBrushSize.value);
        }
    });
    els.propsDrawColor.addEventListener('input', () => {
        if (state.fabricCanvas && state.fabricCanvas.isDrawingMode) {
            state.fabricCanvas.freeDrawingBrush.color = hexToRGBA(
                els.propsDrawColor.value,
                parseFloat(els.propsDrawOpacity.value)
            );
        }
    });
    els.propsDrawOpacity.addEventListener('input', () => {
        if (state.fabricCanvas && state.fabricCanvas.isDrawingMode) {
            state.fabricCanvas.freeDrawingBrush.color = hexToRGBA(
                els.propsDrawColor.value,
                parseFloat(els.propsDrawOpacity.value)
            );
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Ctrl+Z / Ctrl+Shift+Z
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        }
        // Ctrl+Y
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            redo();
        }
        // Delete / Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.fabricCanvas) {
                const active = state.fabricCanvas.getActiveObject();
                // Don't delete if user is editing text
                if (active && !active.isEditing) {
                    e.preventDefault();
                    state.fabricCanvas.remove(active);
                    state.fabricCanvas.discardActiveObject();
                    state.fabricCanvas.renderAll();
                }
            }
        }
        // Ctrl+S — download
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (!els.btnDownload.disabled) exportPDF();
        }
    });
}

function updateSelectedTextProps() {
    if (!state.fabricCanvas) return;
    const active = state.fabricCanvas.getActiveObject();
    if (!active || (active.type !== 'i-text' && active.type !== 'textbox')) return;

    active.set({
        fontSize: parseInt(els.propsFontSize.value),
        fill: els.propsTextColor.value,
        fontFamily: els.propsFontFamily.value,
        fontWeight: els.propsBold.classList.contains('active') ? 'bold' : 'normal',
        fontStyle: els.propsItalic.classList.contains('active') ? 'italic' : 'normal',
    });
    state.fabricCanvas.renderAll();
}

// ─── Init ───────────────────────────────────────────────────────
bindEvents();
