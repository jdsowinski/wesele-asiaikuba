'use strict';

const API = '/api';
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;

// ── Static asset photos (place photo1.jpg … photo5.jpg in frontend/assets/) ──
// uploadedAt dates are set before the wedding so uploaded guest photos
// (which arrive on the day) always sort to the top.
// PLACEHOLDERS: currently using .svg files. When you have real photos,
// replace assets/photo1.svg…photo5.svg with your JPEGs and update the
// filenames below to photo1.jpg…photo5.jpg.
const ASSET_PHOTOS = [
  { url: 'assets/photo1.jpg', filename: 'photo1.jpg', uploadedAt: '2020-01-01T00:00:00.000Z', isAsset: true },
  { url: 'assets/photo2.jpg', filename: 'photo2.jpg', uploadedAt: '2020-01-01T00:01:00.000Z', isAsset: true },
  { url: 'assets/photo3.jpg', filename: 'photo3.jpg', uploadedAt: '2020-01-01T00:02:00.000Z', isAsset: true },
  { url: 'assets/photo4.jpg', filename: 'photo4.jpg', uploadedAt: '2020-01-01T00:03:00.000Z', isAsset: true },
  { url: 'assets/photo5.jpg', filename: 'photo5.jpg', uploadedAt: '2020-01-01T00:04:00.000Z', isAsset: true },
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
const videoGrid = document.getElementById('videoGrid');
const openVideoBtn = document.getElementById('openVideoUploadModal');
const videoUploadModal = document.getElementById('videoUploadModal');
const closeVideoModalBtn = document.getElementById('closeVideoModal');
const cancelVideoUploadBtn = document.getElementById('cancelVideoUpload');
const sendVideoUploadBtn = document.getElementById('sendVideoUpload');
const videoDropZone = document.getElementById('videoDropZone');
const videoFileInput = document.getElementById('videoFileInput');
const videoUploadPreview = document.getElementById('videoUploadPreview');
const videoUploadStatus = document.getElementById('videoUploadStatus');
const videoPlayerModal = document.getElementById('videoPlayerModal');
const closeVideoPlayerModalBtn = document.getElementById('closeVideoPlayerModal');
const videoPlayer = document.getElementById('videoPlayer');
const photoLightboxModal = document.getElementById('photoLightboxModal');
const closePhotoLightboxModalBtn = document.getElementById('closePhotoLightboxModal');
const photoLightboxImage = document.getElementById('photoLightboxImage');

let selectedFiles = [];
let selectedVideoFiles = [];

// ── Load guest photos ────────────────────────────────────────
async function loadPhotos() {
  try {
    const res  = await fetch(`${API}/photos?t=${Date.now()}`, { cache: 'no-store' });
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

async function loadVideos() {
  try {
    const res = await fetch(`${API}/videos?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    const videos = Array.isArray(data.videos)
      ? [...data.videos].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)).slice(0, 5)
      : [];
    renderVideos(videos);
  } catch {
    videoGrid.innerHTML = `
      <div class="photo-empty">
        <div class="photo-empty__icon">🎬</div>
        <p>Nie udało się załadować filmów.</p>
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

  photoGrid.querySelectorAll('.photo-card img').forEach(img => {
    img.addEventListener('click', () => {
      openPhotoLightbox(img.currentSrc || img.src);
    });
  });
}

function renderVideos(videos) {
  if (!videos || videos.length === 0) {
    videoGrid.innerHTML = `
      <div class="photo-empty">
        <div class="photo-empty__icon">🎬</div>
        <p>Brak filmów. Dodaj pierwszy klip z wesela!</p>
      </div>`;
    return;
  }

  videoGrid.innerHTML = videos
    .map((v, index) => `
      <button class="video-card" type="button" data-video-url="${escAttr(v.url)}" aria-label="Odtwórz film ${index + 1}">
        <img
          src="${escAttr(v.thumbnailUrl || '')}"
          alt="Miniaturka filmu"
          loading="lazy"
          onerror="this.closest('.video-card').classList.add('video-card--missing')"
        />
        <div class="video-card__placeholder" aria-hidden="true">🎬</div>
        <span class="video-card__play">▶ Odtwórz</span>
      </button>`)
    .join('');

  videoGrid.querySelectorAll('.video-card').forEach(card => {
    card.addEventListener('click', () => {
      openVideoPlayer(card.dataset.videoUrl || '');
    });
  });
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

function openVideoModal() {
  videoUploadModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeVideoModal() {
  videoUploadModal.classList.remove('active');
  document.body.style.overflow = '';
  resetVideoUpload();
}

function openVideoPlayer(url) {
  if (!url) return;
  videoPlayer.src = url;
  videoPlayerModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  videoPlayer.play().catch(() => {});
}

function closeVideoPlayer() {
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
  videoPlayerModal.classList.remove('active');
  document.body.style.overflow = '';
}

function openPhotoLightbox(url) {
  if (!url) return;
  photoLightboxImage.src = url;
  photoLightboxModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePhotoLightbox() {
  photoLightboxImage.removeAttribute('src');
  photoLightboxModal.classList.remove('active');
  document.body.style.overflow = '';
}

openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
openVideoBtn.addEventListener('click', openVideoModal);
closeVideoModalBtn.addEventListener('click', closeVideoModal);
cancelVideoUploadBtn.addEventListener('click', closeVideoModal);
closeVideoPlayerModalBtn.addEventListener('click', closeVideoPlayer);
closePhotoLightboxModalBtn.addEventListener('click', closePhotoLightbox);

// Close on overlay click
modal.addEventListener('click', e => {
  if (e.target === modal) closeModal();
});
videoUploadModal.addEventListener('click', e => {
  if (e.target === videoUploadModal) closeVideoModal();
});
videoPlayerModal.addEventListener('click', e => {
  if (e.target === videoPlayerModal) closeVideoPlayer();
});
photoLightboxModal.addEventListener('click', e => {
  if (e.target === photoLightboxModal) closePhotoLightbox();
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (modal.classList.contains('active')) closeModal();
  if (videoUploadModal.classList.contains('active')) closeVideoModal();
  if (videoPlayerModal.classList.contains('active')) closeVideoPlayer();
  if (photoLightboxModal.classList.contains('active')) closePhotoLightbox();
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

videoDropZone.addEventListener('click', () => videoFileInput.click());
videoDropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') videoFileInput.click();
});
videoDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  videoDropZone.classList.add('dragover');
});
videoDropZone.addEventListener('dragleave', () => videoDropZone.classList.remove('dragover'));
videoDropZone.addEventListener('drop', e => {
  e.preventDefault();
  videoDropZone.classList.remove('dragover');
  handleVideoFiles(Array.from(e.dataTransfer.files));
});
videoFileInput.addEventListener('change', () => {
  handleVideoFiles(Array.from(videoFileInput.files));
  videoFileInput.value = '';
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

function handleVideoFiles(files) {
  const videos = files.filter(f => f.type.startsWith('video/'));
  selectedVideoFiles = [...selectedVideoFiles, ...videos].filter(v => v.size <= MAX_VIDEO_BYTES);
  renderVideoPreview();
  sendVideoUploadBtn.disabled = selectedVideoFiles.length === 0;
  setVideoStatus('');
}

function renderVideoPreview() {
  videoUploadPreview.innerHTML = '';
  selectedVideoFiles.forEach(file => {
    const wrap = document.createElement('div');
    wrap.className = 'upload-preview__thumb';
    wrap.textContent = `🎬 ${file.name}`;
    wrap.style.padding = '0.4rem';
    wrap.style.fontSize = '0.72rem';
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.textAlign = 'center';
    videoUploadPreview.appendChild(wrap);
  });
}

function resetVideoUpload() {
  selectedVideoFiles = [];
  videoUploadPreview.innerHTML = '';
  sendVideoUploadBtn.disabled = true;
  setVideoStatus('');
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
      setTimeout(() => {
        closeModal();
        window.location.reload();
      }, 900);
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

sendVideoUploadBtn.addEventListener('click', async () => {
  if (selectedVideoFiles.length === 0) return;

  sendVideoUploadBtn.disabled = true;
  cancelVideoUploadBtn.disabled = true;
  setVideoStatus('Wysyłanie filmów…', '');

  try {
    const uploaded = await uploadVideos(selectedVideoFiles);
    if (uploaded > 0) {
      setVideoStatus(`✓ Przesłano ${uploaded} film(ów).`, 'ok');
      resetVideoUpload();
      await loadVideos();
      setTimeout(() => {
        closeVideoModal();
        window.location.reload();
      }, 900);
    } else {
      setVideoStatus('Wystąpił błąd podczas wysyłania filmów.', 'error');
    }
  } catch {
    setVideoStatus('Nie udało się przesłać filmów.', 'error');
  } finally {
    cancelVideoUploadBtn.disabled = false;
    sendVideoUploadBtn.disabled = selectedVideoFiles.length === 0;
  }
});

async function uploadVideos(files) {
  try {
    return await uploadVideosPresigned(files);
  } catch {
    return await uploadVideosLegacy(files);
  }
}

async function uploadVideosPresigned(files) {
  let uploaded = 0;

  for (const file of files) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error('video-too-large');
    }

    const initRes = await fetch(`${API}/videos/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || 'video/mp4',
        fileSize: file.size,
      }),
    });
    if (!initRes.ok) throw new Error('video-upload-url-failed');

    const initData = await initRes.json();
    if (!initData.uploadUrl || !initData.key) throw new Error('video-invalid-upload-url-response');

    const thumbnailBlob = await createVideoThumbnailJpeg(file);
    const thumbInitRes = await fetch(`${API}/videos/thumbnail-upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `${removeFileExtension(file.name)}.jpg`,
        contentType: 'image/jpeg',
      }),
    });
    if (!thumbInitRes.ok) throw new Error('video-thumbnail-upload-url-failed');
    const thumbInitData = await thumbInitRes.json();
    if (!thumbInitData.uploadUrl || !thumbInitData.key) throw new Error('video-thumbnail-upload-url-invalid');

    const thumbPutRes = await fetch(thumbInitData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: thumbnailBlob,
    });
    if (!thumbPutRes.ok) throw new Error('video-thumbnail-put-failed');

    const putRes = await fetch(initData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'video/mp4' },
      body: file,
    });
    if (!putRes.ok) throw new Error('video-s3-put-failed');

    const confirmRes = await fetch(`${API}/videos/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: initData.key,
        thumbnailKey: thumbInitData.key,
        contentType: file.type || 'video/mp4',
        fileName: file.name,
      }),
    });
    if (!confirmRes.ok) throw new Error('video-confirm-failed');

    uploaded += 1;
  }

  return uploaded;
}

async function uploadVideosLegacy(files) {
  const form = new FormData();
  files.forEach(f => form.append('videos', f));

  const res = await fetch(`${API}/videos/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('legacy-video-upload-failed');
  const data = await res.json();
  if (!data.success) throw new Error('legacy-video-upload-response-failed');

  return Array.isArray(data.files) ? data.files.length : files.length;
}

function setStatus(msg, type = '') {
  statusEl.textContent  = msg;
  statusEl.className    = 'upload-status' + (type ? ` upload-status--${type}` : '');
}

function setVideoStatus(msg, type = '') {
  videoUploadStatus.textContent = msg;
  videoUploadStatus.className = 'upload-status' + (type ? ` upload-status--${type}` : '');
}

function removeFileExtension(fileName) {
  const idx = String(fileName || '').lastIndexOf('.');
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

async function createVideoThumbnailJpeg(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('thumbnail-video-load-failed'));
    }, { once: true });

    video.addEventListener('loadeddata', () => {
      const seekTo = Math.min(1, Math.max(0, (video.duration || 0) / 4));
      if (Number.isFinite(seekTo)) {
        video.currentTime = seekTo;
      }
    }, { once: true });

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      const targetWidth = 480;
      const ratio = video.videoWidth > 0 ? video.videoHeight / video.videoWidth : 9 / 16;
      canvas.width = targetWidth;
      canvas.height = Math.max(1, Math.round(targetWidth * ratio));

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('thumbnail-canvas-context-failed'));
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        cleanup();
        if (!blob) {
          reject(new Error('thumbnail-blob-failed'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', 0.82);
    }, { once: true });
  });
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
loadVideos();
