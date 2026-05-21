// schemat-admin.js
export function renderSchemat(main) {
  main.innerHTML = `
    <h2>Kreator schematu stołów</h2>
    <div class="schemat-layout">
      <div class="schemat-canvas-col">
        <div class="schemat-zoom-bar">
          <button id="zoomOut" class="schemat-zoom-btn" title="Oddal">−</button>
          <span id="zoomLevel" class="schemat-zoom-level">100%</span>
          <button id="zoomIn" class="schemat-zoom-btn" title="Przybliż">+</button>
        </div>
        <div class="schemat-canvas-wrap">
          <svg id="roomSvg" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
      </div>
      <div class="schemat-sidebar">
        <button id="addRectTable" class="schemat-btn">+ Stół prostokątny</button>
        <button id="addRoundTable" class="schemat-btn">+ Stół okrągły</button>
        <button id="addHeadTable" class="schemat-btn schemat-btn--head">+ Stół pary młodej</button>
        <button id="addFoodTable" class="schemat-btn schemat-btn--food">+ Stół z jedzeniem</button>
        <div id="tableProps" class="schemat-props"><em>Kliknij stół, aby edytować</em></div>
        <button id="saveLayout" class="schemat-btn schemat-btn--save">Zapisz schemat</button>
      </div>
    </div>`;

  const svg = document.getElementById('roomSvg');
  const VW = 1200, VH = 700;
  let zoom = 1;
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);

  function updateZoom(newZoom) {
    zoom = Math.min(3, Math.max(0.3, newZoom));
    const vw = Math.round(VW / zoom);
    const vh = Math.round(VH / zoom);
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
  }
  document.getElementById('zoomIn').onclick = () => updateZoom(zoom * 1.25);
  document.getElementById('zoomOut').onclick = () => updateZoom(zoom / 1.25);

  let tables = [];
  let selectedId = null;
  let dragOffset = { x: 0, y: 0 };
  let draggingId = null;

  function computeTableDimensions(n, orient, type) {
    const CELL_W = 36, CELL_H = 32, GAP = 4, PAD = 10;
    const count = Math.max(1, n);
    if (type === 'round') {
      const radius = Math.max(50, Math.round(count * (CELL_W + 6) / (2 * Math.PI)));
      return { radius };
    }
    if (orient === 'v') {
      const rows = Math.ceil(count / 2);
      const width = 2 * CELL_W + GAP + 38 + PAD * 2;
      const height = rows * CELL_H + (rows - 1) * GAP + PAD * 2;
      return { width, height };
    } else {
      const cols = Math.max(2, Math.ceil(count / 2));
      const width = cols * CELL_W + (cols - 1) * GAP + PAD * 2;
      const height = 2 * CELL_H + GAP + 28 + PAD * 2;
      return { width, height };
    }
  }

  async function loadLayout() {
    try {
      const res = await fetch('https://api-wesele.asiaikuba.pl/api/seating');
      const data = await res.json();
      if (data && Array.isArray(data.tables)) {
        tables = data.tables.map(t => {
          if (t.type === 'food') return { ...t };
          const n = Array.isArray(t.seats) ? t.seats.length : (Number(t.seats) || 0);
          const orient = t.orientation || 'h';
          const dims = computeTableDimensions(n, orient, t.type);
          return { ...t, seats: n, orientation: orient, ...dims };
        });
      }
    } catch {}
    redraw();
  }

  function redraw() {
    svg.innerHTML = '';
    tables.forEach(table => {
      const isRect = table.type !== 'round';
      const selected = table.id === selectedId;
      let fillColor, strokeColor;
      if (table.type === 'head') {
        fillColor = selected ? '#ffe4b5' : '#fff8e7';
        strokeColor = '#c9a45a';
      } else if (table.type === 'food') {
        fillColor = selected ? '#b2dfdb' : (table.color || '#d4edda');
        strokeColor = '#7ab88a';
      } else {
        fillColor = selected ? '#ffe4b5' : '#fff';
        strokeColor = '#b48b5a';
      }

      let el, cx, topY;
      if (isRect) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        el.setAttribute('x', table.x);
        el.setAttribute('y', table.y);
        el.setAttribute('width', table.width);
        el.setAttribute('height', table.height);
        el.setAttribute('rx', 10);
        cx = table.x + table.width / 2;
        topY = table.y - 6;
      } else {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        el.setAttribute('cx', table.x + table.radius);
        el.setAttribute('cy', table.y + table.radius);
        el.setAttribute('rx', table.radius);
        el.setAttribute('ry', table.radius);
        cx = table.x + table.radius;
        topY = table.y - 6;
      }
      el.setAttribute('fill', fillColor);
      el.setAttribute('stroke', strokeColor);
      el.setAttribute('stroke-width', 2);
      el.style.cursor = 'move';
      el.addEventListener('mousedown', evt => startDrag(evt, table.id));
      el.addEventListener('touchstart', evt => startDrag(evt, table.id), {passive: false});
      svg.appendChild(el);

      const nameLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nameLabel.setAttribute('x', cx);
      nameLabel.setAttribute('y', topY);
      nameLabel.setAttribute('text-anchor', 'middle');
      nameLabel.setAttribute('font-size', '13');
      nameLabel.setAttribute('font-weight', 'bold');
      nameLabel.setAttribute('fill', selected ? '#9e7a4e' : '#6b4c30');
      nameLabel.style.pointerEvents = 'none';
      nameLabel.textContent = table.name || '';
      svg.appendChild(nameLabel);

      if (table.type !== 'food') {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const labelX = isRect ? table.x + table.width / 2 : table.x + table.radius;
        const labelY = isRect ? table.y + table.height / 2 + 6 : table.y + table.radius + 6;
        label.setAttribute('x', labelX);
        label.setAttribute('y', labelY);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '16');
        label.setAttribute('fill', strokeColor);
        label.style.pointerEvents = 'none';
        const seatCount = Array.isArray(table.seats) ? table.seats.length : (Number(table.seats) || 0);
        label.textContent = seatCount + ' miejsc';
        svg.appendChild(label);
      }
    });
  }

  function svgPoint(evt) {
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function startDrag(evt, id) {
    evt.preventDefault();
    selectedId = id;
    draggingId = id;
    const table = tables.find(t => t.id === id);
    const pt = svgPoint(evt);
    dragOffset.x = pt.x - table.x;
    dragOffset.y = pt.y - table.y;
    showProps(table);
    redraw();
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchmove', onDrag, {passive: false});
    window.addEventListener('touchend', endDrag);
  }

  function onDrag(evt) {
    evt.preventDefault();
    if (!draggingId) return;
    const pt = svgPoint(evt);
    const table = tables.find(t => t.id === draggingId);
    const maxW = svg.viewBox.baseVal.width;
    const maxH = svg.viewBox.baseVal.height;
    const w = (table.type === 'round') ? table.radius * 2 : table.width;
    const h = (table.type === 'round') ? table.radius * 2 : table.height;
    table.x = Math.max(0, Math.min(pt.x - dragOffset.x, maxW - w));
    table.y = Math.max(0, Math.min(pt.y - dragOffset.y, maxH - h));
    redraw();
  }

  function endDrag() {
    draggingId = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('touchend', endDrag);
  }

  function showProps(table) {
    const props = document.getElementById('tableProps');
    if (!table) { props.innerHTML = '<em>Kliknij stół, aby edytować</em>'; return; }

    // Food table — only name + color
    if (table.type === 'food') {
      props.innerHTML = `
        <div>
          <strong>Stół z jedzeniem</strong>
          <button id="delTable">Usuń</button>
        </div>
        <div style="margin-top:.5rem">
          Nazwa: <input type="text" id="nameInput" maxlength="40" value="${table.name || ''}" style="width:100%;margin-top:.25rem;border:1px solid var(--border);border-radius:6px;padding:.3rem .5rem;">
        </div>
        <div style="margin-top:.5rem;display:flex;align-items:center;gap:.5rem;">
          Kolor: <input type="color" id="colorInput" value="${table.color || '#d4edda'}" style="width:60px;height:32px;cursor:pointer;border:none;border-radius:4px;">
        </div>`;
      document.getElementById('nameInput').oninput = e => { table.name = e.target.value; redraw(); };
      document.getElementById('colorInput').oninput = e => { table.color = e.target.value; redraw(); };
      document.getElementById('delTable').onclick = () => { tables = tables.filter(t => t.id !== table.id); selectedId = null; redraw(); showProps(null); };
      return;
    }

    const seatCount = Array.isArray(table.seats) ? table.seats.length : (Number(table.seats) || 0);
    const isRect = table.type !== 'round';
    const orient = table.orientation || 'h';
    const typeLabel = table.type === 'head' ? 'Stół pary młodej' : isRect ? 'Stół prostokątny' : 'Stół okrągły';
    props.innerHTML = `
      <div>
        <strong>${typeLabel}</strong>
        <button id="delTable">Usuń</button>
      </div>
      <div style="margin-top:.5rem">
        Nazwa: <input type="text" id="nameInput" maxlength="40" value="${table.name || ''}" style="width:100%;margin-top:.25rem;border:1px solid var(--border);border-radius:6px;padding:.3rem .5rem;">
      </div>
      <div style="margin-top:.5rem">
        Liczba miejsc: <input type="number" id="seatsInput" min="1" max="40" value="${seatCount}" style="width:70px;">
      </div>${isRect ? `
      <div style="margin-top:.5rem">
        Układ:
        <label style="margin-left:.5rem"><input type="radio" name="orient" value="h" ${orient === 'h' ? 'checked' : ''}> ↔ Poziomo</label>
        <label style="margin-left:.75rem"><input type="radio" name="orient" value="v" ${orient === 'v' ? 'checked' : ''}> ↕ Pionowo</label>
      </div>` : ''}`;
    document.getElementById('seatsInput').oninput = e => {
      const n = Math.max(1, Math.min(40, Number(e.target.value)));
      table.seats = n;
      const dims = computeTableDimensions(n, table.orientation || 'h', table.type);
      Object.assign(table, dims);
      redraw();
    };
    document.getElementById('nameInput').oninput = e => {
      table.name = e.target.value;
      redraw();
    };
    if (isRect) {
      document.querySelectorAll('input[name="orient"]').forEach(radio => {
        radio.onchange = e => {
          table.orientation = e.target.value;
          const n = Array.isArray(table.seats) ? table.seats.length : (Number(table.seats) || 0);
          const dims = computeTableDimensions(n, table.orientation, table.type);
          Object.assign(table, dims);
          redraw();
        };
      });
    }
    document.getElementById('delTable').onclick = () => {
      tables = tables.filter(t => t.id !== table.id);
      selectedId = null;
      redraw();
      showProps(null);
    };
  }

  document.getElementById('addRectTable').onclick = () => {
    const id = 't' + Math.random().toString(36).slice(2, 9);
    const dims = computeTableDimensions(8, 'h', 'rect');
    tables.push({ id, type: 'rect', x: 50, y: 50, ...dims, seats: 8, orientation: 'h', name: 'Stół' });
    selectedId = id;
    redraw();
    showProps(tables.find(t => t.id === id));
  };

  document.getElementById('addRoundTable').onclick = () => {
    const id = 't' + Math.random().toString(36).slice(2, 9);
    const dims = computeTableDimensions(8, 'h', 'round');
    tables.push({ id, type: 'round', x: 200, y: 100, ...dims, seats: 8, name: 'Stół' });
    selectedId = id;
    redraw();
    showProps(tables.find(t => t.id === id));
  };

  document.getElementById('addHeadTable').onclick = () => {
    const id = 't' + Math.random().toString(36).slice(2, 9);
    const dims = computeTableDimensions(10, 'h', 'rect');
    tables.push({ id, type: 'head', x: 50, y: 50, ...dims, seats: 10, orientation: 'h', name: 'Stół pary młodej' });
    selectedId = id;
    redraw();
    showProps(tables.find(t => t.id === id));
  };

  document.getElementById('addFoodTable').onclick = () => {
    const id = 't' + Math.random().toString(36).slice(2, 9);
    tables.push({ id, type: 'food', x: 100, y: 300, width: 200, height: 60, name: 'Stół z jedzeniem', color: '#d4edda', seats: 0 });
    selectedId = id;
    redraw();
    showProps(tables.find(t => t.id === id));
  };

  document.getElementById('saveLayout').onclick = async () => {
    try {
      // Load existing data to preserve guest seat assignments
      let existing = { tables: [], zones: [] };
      try {
        const r = await fetch('https://api-wesele.asiaikuba.pl/api/seating');
        existing = await r.json();
      } catch {}
      // Merge geometry updates while keeping existing guest arrays
      const mergedTables = tables.map(t => {
        if (t.type === 'food') return { ...t };
        const n = Array.isArray(t.seats) ? t.seats.length : (Number(t.seats) || 0);
        const existingTable = (existing.tables || []).find(e => e.id === t.id);
        let seats;
        if (existingTable && Array.isArray(existingTable.seats)) {
          seats = Array.from({ length: n }, (_, i) =>
            existingTable.seats[i] || { seat: String(i + 1), guest: 'Do ustalenia' });
        } else {
          seats = n;
        }
        return { ...t, seats };
      });
      const res = await fetch('https://api-wesele.asiaikuba.pl/api/seating', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables: mergedTables, zones: existing.zones || [] })
      });
      if (res.ok) {
        alert('Schemat zapisany!');
      } else {
        alert('Błąd zapisu schematu');
      }
    } catch {
      alert('Błąd zapisu schematu');
    }
  };

  svg.addEventListener('mousedown', evt => {
    if (evt.target === svg) {
      selectedId = null;
      showProps(null);
      redraw();
    }
  });

  loadLayout();
}
