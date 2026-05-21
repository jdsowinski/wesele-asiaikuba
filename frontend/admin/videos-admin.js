// videos-admin.js
export function renderVideos(main) {
  main.innerHTML = `<h2>Filmy</h2>
    <div class="admin-toolbar">
      <label>Ilość na stronę: <select id="videosPageSize">
        <option value="6">6</option>
        <option value="12">12</option>
        <option value="24">24</option>
        <option value="48">48</option>
      </select></label>
      <label>Sortuj:
        <select id="videosSort">
          <option value="newest">Najnowsze</option>
          <option value="oldest">Najstarsze</option>
          <option value="name">Nazwa</option>
        </select>
      </label>
      <button id="videosDownloadAll">Pobierz wszystkie (ZIP)</button>
      <button id="videosPrev">Poprzednia</button>
      <span id="videosPageInfo"></span>
      <button id="videosNext">Następna</button>
    </div>
    <div id="videosGrid" class="admin-video-grid"></div>`;

  let allVideos = [];
  let page = 1;
  let pageSize = 6;

  async function fetchVideos() {
    try {
      const res = await fetch('https://api-wesele.asiaikuba.pl/api/videos');
      const data = await res.json();
      if (Array.isArray(data.videos)) {
        allVideos = data.videos;
      } else {
        allVideos = [];
      }
    } catch {
      allVideos = [];
    }
    renderPage();
  }

  function sortVideos(list) {
    const sort = document.getElementById('videosSort').value;
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
    const grid = document.getElementById('videosGrid');
    const pageInfo = document.getElementById('videosPageInfo');
    const total = allVideos.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.max(1, Math.min(page, pages));
    const sorted = sortVideos(allVideos);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    grid.innerHTML = '';
    for (let i = start; i < end; ++i) {
      const video = sorted[i];
      const wrapper = document.createElement('div');
      wrapper.className = 'admin-video-item';
      const thumb = document.createElement('img');
      thumb.src = video.thumbnailUrl || '';
      thumb.alt = video.filename || 'Miniatura filmu';
      thumb.className = 'admin-video-thumb';
      thumb.style.cursor = 'pointer';
      thumb.onclick = () => {
        window.open(video.url, '_blank');
      };
      wrapper.appendChild(thumb);
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Usuń';
      delBtn.className = 'admin-video-del';
      delBtn.onclick = async () => {
        if (confirm('Usunąć ten film?')) {
          await deleteVideo(video.key);
        }
      };
      wrapper.appendChild(delBtn);
      grid.appendChild(wrapper);
    }
    pageInfo.textContent = `Strona ${page} z ${pages}`;
  }

  async function deleteVideo(key) {
    try {
      await fetch('https://api-wesele.asiaikuba.pl/api/videos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      await fetchVideos();
    } catch {}
  }

  document.getElementById('videosDownloadAll').onclick = async () => {
    // Pobierz wszystkie filmy jako ZIP
    const JSZip = window.JSZip || (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')).default;
    const zip = new JSZip();
    const sorted = sortVideos(allVideos);
    let count = 0;
    for (const video of sorted) {
      try {
        const res = await fetch(video.url);
        const blob = await res.blob();
        zip.file(video.filename || `video${++count}.mp4`, blob);
      } catch {}
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = 'filmy.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  document.getElementById('videosPageSize').onchange = e => {
    pageSize = Number(e.target.value);
    page = 1;
    renderPage();
  };
  document.getElementById('videosSort').onchange = () => {
    page = 1;
    renderPage();
  };
  document.getElementById('videosPrev').onclick = () => {
    page = Math.max(1, page - 1);
    renderPage();
  };
  document.getElementById('videosNext').onclick = () => {
    page = Math.min(Math.ceil(allVideos.length / pageSize), page + 1);
    renderPage();
  };

  fetchVideos();
}
