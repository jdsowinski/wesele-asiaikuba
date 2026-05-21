'use strict';

const API = '/api';

// ── Static asset photos (place photo1.jpg … photo5.jpg in frontend/assets/) ──
// uploadedAt dates are set before the wedding so uploaded guest photos
// (which arrive on the day) always sort to the top.
// PLACEHOLDERS: currently using .svg files. When you have real photos,
// replace assets/photo1.svg…photo5.svg with your JPEGs and update the
// filenames below to photo1.jpg…photo5.jpg.
const ASSET_PHOTOS = [
  { url: 'assets/photo1.jpg', filename: 'photo1.jpg', uploadedAt: '2026-06-27T06:00:00.000Z', isAsset: true },
  { url: 'assets/photo2.jpg', filename: 'photo2.jpg', uploadedAt: '2026-06-27T06:01:00.000Z', isAsset: true },
  { url: 'assets/photo3.jpg', filename: 'photo3.jpg', uploadedAt: '2026-06-27T06:02:00.000Z', isAsset: true },
  { url: 'assets/photo4.jpg', filename: 'photo4.jpg', uploadedAt: '2026-06-27T06:03:00.000Z', isAsset: true },
  { url: 'assets/photo5.jpg', filename: 'photo5.jpg', uploadedAt: '2026-06-27T06:04:00.000Z', isAsset: true },
];

const MAX_TEASER_UPLOADS = 20; // unused here – gallery shows everything

// ── DOM refs ─────────────────────────────────────────────────
const photoGrid     = document.getElementById('photoGrid');
const openBtn       = document.getElementById('openUploadModal');
const closeBtn      = document.getElementById('closeModal');
const cancelBtn     = document.getElementById('cancelUpload');
const sendBtn       = document.getElementById('sendUpload');
const modal         = document.getElementById('uploadModal');
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const previewArea   = document.getElementById('uploadPreview');
const statusEl      = document.getElementById('uploadStatus');

let selectedFiles = [];

// ── Load guest photos ────────────────────────────────────────
async function loadPhotos() {
  try {
    const res  = await fetch(`${API}/photos`);
    const data = await res.json();

    // Merge uploaded photos with static assets, sort newest first – show ALL
    const merged = [...data.photos, ...ASSET_PHOTOS]
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    renderPhotos(merged);
  } catch {
    photoGrid.innerHTML = `
      <div class="photo-empty">
        <div class="photo-empty__icon">📷</div>
        <p>Nie udało się załadować zdjęć.<br>Upewnij się, że backend działa.</p>
      </div>`;
  }
}

function renderPhotos(photos) {
  if (!photos || photos.length === 0) {
    photoGrid.innerHTML = `
      <div class="photo-empty">
        <div class="photo-empty__icon">📷</div>
        <p>Brak zdjęć – bądź pierwszy/a!<br>Prześlij swoje zdjęcia z wesela.</p>
      </div>`;
    return;
  }

  photoGrid.innerHTML = photos
    .map(p => `
      <div class="photo-card">
        <img
          src="${escAttr(p.url)}"
          alt="Zdjęcie z wesela"
          loading="lazy"
          onerror="this.closest('.photo-card').classList.add('photo-card--missing')"
        />
        <div class="photo-card__placeholder" aria-hidden="true">📷</div>
      </div>`)
    .join('');
}

// ── Modal open / close ───────────────────────────────────────
function openModal() {
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.classList.remove('active');
  document.body.style.overflow = '';
  resetUpload();
}

openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

// Close on overlay click
modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
});

// ── Drop zone interaction ─────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFiles(Array.from(e.dataTransfer.files));
});

fileInput.addEventListener('change', () => {
  handleFiles(Array.from(fileInput.files));
  fileInput.value = ''; // allow re-selecting same file
});

// ── File handling ─────────────────────────────────────────────
function handleFiles(files) {
  const images = files.filter(f => f.type.startsWith('image/'));
  selectedFiles = [...selectedFiles, ...images];
  renderPreview();
  sendBtn.disabled = selectedFiles.length === 0;
  setStatus('');
}

function renderPreview() {
  previewArea.innerHTML = '';
  selectedFiles.forEach(file => {
    const wrap = document.createElement('div');
    wrap.className = 'upload-preview__thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = file.name;
    img.onload = () => URL.revokeObjectURL(img.src);
    wrap.appendChild(img);
    previewArea.appendChild(wrap);
  });
}

function resetUpload() {
  selectedFiles = [];
  previewArea.innerHTML = '';
  sendBtn.disabled = true;
  setStatus('');
}

// ── Upload ────────────────────────────────────────────────────
sendBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  sendBtn.disabled    = true;
  cancelBtn.disabled  = true;
  setStatus('Wysyłanie zdjęć…', '');

  try {
    const uploadedCount = await uploadPhotos(selectedFiles);

    if (uploadedCount > 0) {
      setStatus(`✓ Przesłano ${uploadedCount} zdjęcie/zdjęcia. Dziękujemy! ♥`, 'ok');
      resetUpload();
      await loadPhotos();
      setTimeout(closeModal, 1800);
    } else {
      setStatus('Wystąpił błąd. Spróbuj ponownie.', 'error');
    }
  } catch {
    setStatus('Błąd połączenia. Upewnij się, że backend działa.', 'error');
  } finally {
    cancelBtn.disabled = false;
    sendBtn.disabled   = selectedFiles.length === 0;
  }
});

async function uploadPhotos(files) {
  try {
    return await uploadPhotosPresigned(files);
  } catch {
    return await uploadPhotosLegacy(files);
  }
}

async function uploadPhotosPresigned(files) {
  let uploaded = 0;

  for (const file of files) {
    const initRes = await fetch(`${API}/photos/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type || 'image/jpeg' }),
    });

    if (!initRes.ok) throw new Error('upload-url-failed');
    const initData = await initRes.json();
    if (!initData.uploadUrl || !initData.key) throw new Error('invalid-upload-url-response');

    const putRes = await fetch(initData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'image/jpeg' },
      body: file,
    });
    if (!putRes.ok) throw new Error('s3-put-failed');

    const confirmRes = await fetch(`${API}/photos/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: initData.key }),
    });
    if (!confirmRes.ok) throw new Error('confirm-failed');

    uploaded += 1;
  }

  return uploaded;
}

async function uploadPhotosLegacy(files) {
  const form = new FormData();
  files.forEach(f => form.append('photos', f));

  const res = await fetch(`${API}/photos/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('legacy-upload-failed');
  const data = await res.json();
  if (!data.success) throw new Error('legacy-upload-response-failed');

  return Array.isArray(data.files) ? data.files.length : files.length;
}

function setStatus(msg, type = '') {
  statusEl.textContent  = msg;
  statusEl.className    = 'upload-status' + (type ? ` upload-status--${type}` : '');
}

// ── Scroll animations ─────────────────────────────────────────
const observer = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.1 }
);
document.querySelectorAll('.historia-photo-item').forEach((el, i) => {
  el.style.transitionDelay = `${i * 0.1}s`;
  observer.observe(el);
});

// ── Helpers ───────────────────────────────────────────────────
function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Init ──────────────────────────────────────────────────────
loadPhotos();
