let currentImage = null;
let currentRotation = 0;
let currentZoom = 1;
let allImages = [];
let features = [];
let pipelineState = { currentStep: 'upload', steps: [] };

document.addEventListener('DOMContentLoaded', () => {
    initDropZone();
    loadExistingImages();
    loadFeatures();
    initKeyboardShortcuts();
});

function initDropZone() {
    const dz = document.getElementById('dropZone');
    const fi = document.getElementById('fileInput');

    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });
    fi.addEventListener('change', e => handleFiles(e.target.files));
}

function handleFiles(files) {
    if (!files.length) return;
    const progress = document.getElementById('uploadProgress');
    const bar = progress.querySelector('.progress-bar');
    const status = document.getElementById('uploadStatus');
    progress.style.display = 'block';

    let done = 0;
    const total = files.length;

    Array.from(files).forEach((file, i) => {
        const fd = new FormData();
        fd.append('file', file);

        fetch('/api/upload', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(data => {
                done++;
                bar.style.width = `${(done / total) * 100}%`;
                status.textContent = `Uploaded ${done}/${total}`;

                if (data.type === 'image') {
                    allImages.push(data);
                    renderImageList();
                } else {
                    renderVideoList(data);
                }

                if (done === total) {
                    setTimeout(() => { progress.style.display = 'none'; bar.style.width = '0%'; }, 800);
                    showToast('Upload Complete', `${total} file(s) uploaded successfully`);
                }
            })
            .catch(err => {
                done++;
                bar.style.width = `${(done / total) * 100}%`;
                showToast('Upload Error', err.message, 'danger');
            });
    });
}

function loadExistingImages() {
    fetch('/api/images')
        .then(r => r.json())
        .then(data => {
            allImages = data;
            renderImageList();
            const videos = data.filter(d => d.type === 'video');
            videos.forEach(v => renderVideoList(v));
        });
}

function renderImageList() {
    const el = document.getElementById('imageList');
    el.innerHTML = allImages.map(img => `
        <div class="image-item ${currentImage && currentImage.id === img.id ? 'active' : ''}"
             onclick="selectImage('${img.id}')" data-id="${img.id}">
            <img src="${img.thumb_url || img.url}" class="image-thumb" loading="lazy" alt="">
            <div class="name">${img.filename}</div>
            <span class="badge bg-secondary">${img.type === 'video' ? 'VID' : 'IMG'}</span>
        </div>
    `).join('');
}

function renderVideoList(video) {
    const el = document.getElementById('videoList');
    if (el.textContent.includes('No videos')) el.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'image-item';
    div.onclick = () => playVideo(video.url, video.filename);
    div.innerHTML = `
        <i class="bi bi-play-circle text-danger" style="font-size:1.5rem"></i>
        <div class="name">${video.filename}</div>
    `;
    el.appendChild(div);
}

function selectImage(id) {
    const img = allImages.find(i => i.id === id);
    if (!img) return;

    currentImage = img;
    currentRotation = 0;
    currentZoom = 1;

    document.getElementById('viewerEmpty').style.display = 'none';
    const mainImg = document.getElementById('mainImage');
    const mainVid = document.getElementById('mainVideo');
    mainImg.style.display = 'block';
    mainVid.style.display = 'none';
    mainImg.src = img.url;
    mainImg.style.transform = 'scale(1)';
    document.getElementById('imageContainer').style.display = 'block';

    document.getElementById('viewerControls').style.display = 'flex';
    document.getElementById('noImageMsg').style.display = 'none';
    document.getElementById('toolsContent').style.display = 'block';

    document.getElementById('imageInfo').innerHTML = `
        <div><strong>Name:</strong> ${img.filename}</div>
        ${img.width ? `<div><strong>Size:</strong> ${img.width} x ${img.height}</div>` : ''}
        <div><strong>Type:</strong> ${img.type}</div>
        <div><strong>File size:</strong> ${formatSize(img.size)}</div>
    `;

    renderImageList();
    initRegionSelection();
}

function playVideo(url, name) {
    document.getElementById('viewerEmpty').style.display = 'none';
    const mainImg = document.getElementById('mainImage');
    const mainVid = document.getElementById('mainVideo');
    mainImg.style.display = 'none';
    mainVid.style.display = 'block';
    mainVid.src = url;
    mainVid.load();
    document.getElementById('imageContainer').style.display = 'block';
    showToast('Video Loaded', name);
}

function rotateImage(angle) {
    if (!currentImage) return;
    if (angle === 0) {
        currentRotation = 0;
        currentZoom = 1;
        document.getElementById('mainImage').style.transform = 'scale(1)';
        return;
    }
    currentRotation += angle;
    const img = document.getElementById('mainImage');
    img.style.transform = `rotate(${currentRotation}deg) scale(${currentZoom})`;

    const cacheKey = `${currentImage.safe_name}_${Math.abs(currentRotation % 360)}`;
    fetch('/api/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safe_name: currentImage.safe_name, angle: Math.abs(currentRotation % 360) })
    }).then(r => r.json()).then(data => {
        if (data.url) {
            img.src = data.url + '?t=' + Date.now();
        }
    });
}

function zoomIn() {
    currentZoom = Math.min(currentZoom + 0.2, 5);
    applyZoom();
}

function zoomOut() {
    currentZoom = Math.max(currentZoom - 0.2, 0.2);
    applyZoom();
}

function applyZoom() {
    const img = document.getElementById('mainImage');
    img.style.transform = `rotate(${currentRotation}deg) scale(${currentZoom})`;
}

function enhanceImage(mode) {
    if (!currentImage) return;
    showToast('Enhancing', `Applying ${mode}...`);

    fetch('/api/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safe_name: currentImage.safe_name, mode: mode })
    }).then(r => r.json()).then(data => {
        if (data.url) {
            document.getElementById('mainImage').src = data.url + '?t=' + Date.now();
            showToast('Enhanced', `${mode} applied successfully`);
        }
    }).catch(err => showToast('Error', err.message, 'danger'));
}

function runStep(step) {
    if (!currentImage) return;
    showToast('Running', `Starting ${step}...`);

    fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safe_name: currentImage.safe_name, step: step })
    }).then(r => r.json()).then(data => {
        showToast('Complete', data.message);
        updatePipelineState(step);
    }).catch(err => showToast('Error', err.message, 'danger'));
}

function showPipeline() {
    const card = document.getElementById('pipelineCard');
    card.style.display = card.style.display === 'none' ? 'block' : 'none';
    renderPipeline();
}

function renderPipeline() {
    const steps = [
        { id: 'upload', name: 'Upload', icon: 'bi-cloud-arrow-up' },
        { id: 'detect', name: 'Detect', icon: 'bi-cell' },
        { id: 'segment', name: 'Segment', icon: 'bi-bounding-box' },
        { id: 'deconv', name: 'Deconvolve', icon: 'bi-layers' },
        { id: 'annotate', name: 'Annotate', icon: 'bi-tags' },
        { id: 'predict', name: 'Predict', icon: 'bi-graph-up' },
        { id: 'analyze', name: 'Analyze', icon: 'bi-diagram-3' },
    ];

    const el = document.getElementById('pipelineSteps');
    el.innerHTML = steps.map((s, i) => {
        const isActive = pipelineState.currentStep === s.id;
        const isCompleted = steps.findIndex(x => x.id === pipelineState.currentStep) > i;
        const cls = isActive ? 'active' : isCompleted ? 'completed' : '';
        return `
            ${i > 0 ? '<div class="pipeline-arrow"><i class="bi bi-arrow-right"></i></div>' : ''}
            <div class="pipeline-step ${cls}" onclick="runStep('${s.id}')">
                <div class="step-icon"><i class="bi ${s.icon}"></i></div>
                <div class="step-label">${s.name}</div>
            </div>
        `;
    }).join('');
}

function updatePipelineState(step) {
    pipelineState.currentStep = step;
    renderPipeline();
}

function showFeatures() {
    if (features.length) {
        renderFeaturesModal();
        return;
    }
    fetch('/api/features')
        .then(r => r.json())
        .then(data => {
            features = data;
            renderFeaturesModal();
        });
}

function renderFeaturesModal() {
    const el = document.getElementById('featuresList');
    el.innerHTML = `<div class="row g-3">
        ${features.map(f => `
            <div class="col-sm-6 col-lg-4">
                <div class="feature-card">
                    <div class="feature-icon"><i class="bi ${f.icon}"></i></div>
                    <div class="feature-name">${f.name}</div>
                    <div class="feature-desc">${f.description}</div>
                    <div class="feature-category">${f.category}</div>
                </div>
            </div>
        `).join('')}
    </div>`;

    const modal = new bootstrap.Modal(document.getElementById('featuresModal'));
    modal.show();
}

function loadFeatures() {
    fetch('/api/features').then(r => r.json()).then(data => { features = data; });
}

function deleteCurrentImage() {
    if (!currentImage) return;
    if (!confirm('Delete this image?')) return;

    fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safe_name: currentImage.safe_name })
    }).then(r => r.json()).then(() => {
        allImages = allImages.filter(i => i.id !== currentImage.id);
        currentImage = null;
        document.getElementById('mainImage').style.display = 'none';
        document.getElementById('viewerEmpty').style.display = 'block';
        document.getElementById('viewerControls').style.display = 'none';
        document.getElementById('toolsContent').style.display = 'none';
        document.getElementById('noImageMsg').style.display = 'block';
        renderImageList();
        showToast('Deleted', 'Image removed');
    });
}

function initRegionSelection() {
    const canvas = document.getElementById('regionCanvas');
    const ctx = canvas.getContext('2d');
    const img = document.getElementById('mainImage');

    img.onload = () => {
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
    };

    canvas.style.pointerEvents = 'none';
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowLeft') rotateImage(-90);
        if (e.key === 'ArrowRight') rotateImage(90);
        if (e.key === '+' || e.key === '=') zoomIn();
        if (e.key === '-') zoomOut();
        if (e.key === '0') rotateImage(0);
        if (e.key === 'Delete' || e.key === 'Backspace') deleteCurrentImage();
        if (e.key === 'f' || e.key === 'F') showFeatures();
    });
}

function showToast(title, body, type) {
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastBody').textContent = body;
    const toast = new bootstrap.Toast(document.getElementById('toast'));
    toast.show();
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
