// photos-admin.js
export function renderPhotos(main) {
  main.innerHTML = `<h2>Zdjęcia</h2>
    <div class="admin-toolbar">
      <label>Ilość na stronę: <select id="photosPageSize">
        <option value="12">12</option>
        <option value="24">24</option>
        <option value="48">48</option>
        <option value="96">96</option>
      </select></label>
      <label>Sortuj:
        <select id="photosSort">
          <option value="newest">Najnowsze</option>
          <option value="oldest">Najstarsze</option>
          <option value="name">Nazwa</option>
        </select>
      </label>
      <button id="photosDownloadAll">Pobierz wszystkie (ZIP)</button>
      <button id="photosPrev">Poprzednia</button>
      <span id="photosPageInfo"></span>
      <button id="photosNext">Następna</button>
    </div>
    <div id="photosGrid" class="admin-photo-grid"></div>`;

  let allPhotos = [];
  let page = 1;
  let pageSize = 12;

  async function fetchPhotos() {
    try {
      const res = await fetch('https://api-wesele.asiaikuba.pl/api/photos');
      const data = await res.json();
      if (Array.isArray(data.photos)) {
        allPhotos = data.photos;
      } else {
        allPhotos = [];
      }
    } catch {
      allPhotos = [];
    }
    renderPage();
  }

  function sortPhotos(list) {
    const sort = document.getElementById('photosSort').value;
    if (sort === 'newest') {
      return [...list].sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
    } else if (sort === 'oldest') {
      return [...list].sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || ''));
    } else if (sort === 'name') {
      return [...list].sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
    }
    return list;
  }

  function renderPage() {
    const grid = document.getElementById('photosGrid');
    const pageInfo = document.getElementById('photosPageInfo');
    const total = allPhotos.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.max(1, Math.min(page, pages));
    const sorted = sortPhotos(allPhotos);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    grid.innerHTML = '';
    for (let i = start; i < end; ++i) {
      const photo = sorted[i];
      const wrapper = document.createElement('div');
      wrapper.className = 'admin-photo-item';
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = photo.filename || 'Zdjęcie';
      img.className = 'admin-photo-thumb';
      wrapper.appendChild(img);
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Usuń';
      delBtn.className = 'admin-photo-del';
      delBtn.onclick = async () => {
        if (confirm('Usunąć to zdjęcie?')) {
          await deletePhoto(photo.key);
        }
      };
      wrapper.appendChild(delBtn);
      grid.appendChild(wrapper);
    }
    pageInfo.textContent = `Strona ${page} z ${pages}`;
  }

  async function deletePhoto(key) {
    try {
      await fetch('https://api-wesele.asiaikuba.pl/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      await fetchPhotos();
    } catch {}
  }

  document.getElementById('photosDownloadAll').onclick = async () => {
    // Pobierz wszystkie zdjęcia jako ZIP
    const JSZip = window.JSZip || (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')).default;
    const zip = new JSZip();
    const sorted = sortPhotos(allPhotos);
    let count = 0;
    for (const photo of sorted) {
      try {
        const res = await fetch(photo.url);
        const blob = await res.blob();
        zip.file(photo.filename || `photo${++count}.jpg`, blob);
      } catch {}
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'zdjecia.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  document.getElementById('photosPageSize').onchange = e => {
    pageSize = Number(e.target.value);
    page = 1;
    renderPage();
  };
  document.getElementById('photosSort').onchange = () => {
    page = 1;
    renderPage();
  };
  document.getElementById('photosPrev').onclick = () => {
    page = Math.max(1, page - 1);
    renderPage();
  };
  document.getElementById('photosNext').onclick = () => {
    page = Math.min(Math.ceil(allPhotos.length / pageSize), page + 1);
    renderPage();
  };

  fetchPhotos();
}
