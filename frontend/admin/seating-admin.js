// seating-admin.js – full rewrite with proper rect/round layouts
export function renderSeating(main) {
  main.innerHTML = `
    <h2>Zarządzanie miejscami</h2>
    <div class="admin-toolbar">
      <input id="newGuestName" type="text" placeholder="Imię i nazwisko gościa" style="border:1px solid var(--border);border-radius:8px;padding:.45rem .8rem;min-width:240px;" />
      <button id="addGuestBtn" class="btn btn--primary" style="padding:.45rem 1.2rem;">Dodaj na pierwsze wolne</button>
      <button id="exportBtn" class="btn btn--outline" style="padding:.45rem 1.2rem;">Eksportuj JSON</button>
      <button id="resetBtn" class="btn btn--outline" style="padding:.45rem 1.2rem;">Odśwież z bazy</button>
      <span id="adminStatus" style="font-family:var(--font-sans);font-size:.85rem;color:var(--text-mid);"></span>
    </div>
    <div id="adminTablesPanel" style="display:flex;flex-wrap:wrap;gap:2rem;padding:1rem 0;"></div>

    <div id="adminEditOverlay" style="display:none;position:fixed;inset:0;background:rgba(46,27,14,.45);z-index:999;align-items:center;justify-content:center;">
      <div style="background:var(--white);border-radius:var(--radius-lg);padding:2rem;max-width:400px;width:90%;box-shadow:var(--shadow-lg);">
        <h3 style="font-family:var(--font-script);font-size:1.6rem;color:var(--gold-dark);margin-bottom:.25rem;">Edytuj gościa</h3>
        <p id="editMeta" style="font-family:var(--font-sans);font-size:.85rem;color:var(--text-light);margin-bottom:1rem;"></p>
        <input id="editInput" type="text" placeholder="Imię i nazwisko" maxlength="120"
          style="width:100%;border:1px solid var(--border);border-radius:8px;padding:.6rem .8rem;margin-bottom:1rem;" />
        <p style="font-family:var(--font-sans);font-size:.8rem;color:var(--text-light);margin-bottom:1.25rem;">Zostaw puste, aby oznaczyć jako wolne miejsce.</p>
        <div style="display:flex;gap:.75rem;justify-content:flex-end;">
          <button id="editCancel" class="btn btn--outline" style="padding:.45rem 1.2rem;">Anuluj</button>
          <button id="editSave" class="btn btn--primary" style="padding:.45rem 1.2rem;">Zapisz</button>
        </div>
      </div>
    </div>`;

  const panel    = main.querySelector('#adminTablesPanel');
  const statusEl = main.querySelector('#adminStatus');
  const overlay  = main.querySelector('#adminEditOverlay');
  const editMeta  = main.querySelector('#editMeta');
  const editInput = main.querySelector('#editInput');
  overlay.style.display = 'none';

  const API_BASE = 'https://api-wesele.asiaikuba.pl/api';
  let seatingData = null;
  let editingRef  = null;

  function setStatus(msg) { statusEl.textContent = msg; }

  function isTaken(guest) {
    const n = String(guest || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return n !== '' && n !== 'do ustalenia' && n !== 'wolne' && n !== 'tbd';
  }

  /* If seats is still a raw number (from schemat-admin), convert to array */
  function normalizeSeats(table) {
    if (Array.isArray(table.seats)) return table.seats;
    const count = Number(table.seats) || 0;
    return Array.from({ length: count }, (_, i) => ({ seat: i + 1, guest: 'Do ustalenia' }));
  }

  function normalizeAllTables() {
    seatingData.tables = (seatingData.tables || []).map(t => ({ ...t, seats: normalizeSeats(t) }));
  }

  async function save() {
    const res = await fetch(`${API_BASE}/seating`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(seatingData),
    });
    if (!res.ok) throw new Error('save-failed');
  }

  function getSeat(tableId, idx) {
    const t = seatingData.tables.find(t => String(t.id) === String(tableId));
    return t ? (t.seats[idx] || null) : null;
  }

  /* ---- SEAT ELEMENT ---- */

  function attachSeatEvents(el, tableId, idx) {
    el.draggable = true;
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ tableId, idx }));
      el.style.opacity = '.5';
    });
    el.addEventListener('dragend', () => { el.style.opacity = '1'; });
    el.addEventListener('dragover', e => { e.preventDefault(); el.style.outline = '2px solid var(--gold)'; });
    el.addEventListener('dragleave', () => { el.style.outline = ''; });
    el.addEventListener('drop', e => {
      e.preventDefault(); el.style.outline = '';
      try { const src = JSON.parse(e.dataTransfer.getData('text/plain')); swapSeats(src.tableId, src.idx, tableId, idx); } catch {}
    });
    el.addEventListener('click', () => { const s = getSeat(tableId, idx); if (s) openEdit(tableId, idx, s); });
  }

  function makeSeatEl(seat, tableId, idx, shape) {
    const taken = isTaken(seat.guest);
    const el = document.createElement('div');
    if (shape === 'circle') {
      el.style.cssText = `position:absolute;width:42px;height:42px;border-radius:50%;background:${taken ? 'var(--gold-light)' : '#fff'};border:2px solid ${taken ? 'var(--gold)' : 'var(--border)'};display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-sizing:border-box;padding:2px;transform:translate(-50%,-50%);`;
    } else {
      el.style.cssText = `background:${taken ? 'var(--gold-light)' : '#fff'};border:1px solid ${taken ? 'var(--gold)' : 'var(--border)'};border-radius:8px;padding:.35rem .5rem;font-size:.75rem;cursor:pointer;min-width:56px;text-align:center;box-sizing:border-box;`;
    }
    el.title = taken ? seat.guest : 'Wolne – kliknij, aby przypisać';
    const numEl = document.createElement('div');
    numEl.style.cssText = 'color:var(--text-light);font-size:.6rem;line-height:1;';
    numEl.textContent = seat.seat;
    const guestEl = document.createElement('div');
    guestEl.style.cssText = `font-weight:700;font-size:${shape === 'circle' ? '.55rem' : '.7rem'};color:${taken ? 'var(--brown)' : 'var(--text-light)'};line-height:1.2;overflow:hidden;max-width:${shape === 'circle' ? '38px' : '100%'};white-space:nowrap;text-overflow:ellipsis;`;
    guestEl.textContent = taken ? seat.guest.split(' ')[0] : '—';
    el.appendChild(numEl);
    el.appendChild(guestEl);
    attachSeatEvents(el, tableId, idx);
    return el;
  }

  /* ---- ROUND TABLE (circular CSS layout) ---- */

  function renderRoundTable(table, card) {
    const seats = table.seats;
    const n = seats.length;
    const size = Math.max(200, Math.min(320, 60 + n * 20));
    const r = size / 2 - 28;

    const wrap = document.createElement('div');
    wrap.style.cssText = `position:relative;width:${size}px;height:${size}px;margin:0 auto;`;

    const discSize = Math.max(60, size - 130);
    const disc = document.createElement('div');
    disc.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${discSize}px;height:${discSize}px;border-radius:50%;background:var(--bg-warm,#faf7f2);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans);font-size:.72rem;color:var(--text-light);text-align:center;padding:4px;box-sizing:border-box;`;
    disc.textContent = table.label || table.name || `Stół ${table.id}`;
    wrap.appendChild(disc);

    seats.forEach((seat, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2;
      const el = makeSeatEl(seat, table.id, i, 'circle');
      el.style.left = `${size / 2 + r * Math.cos(angle)}px`;
      el.style.top  = `${size / 2 + r * Math.sin(angle)}px`;
      wrap.appendChild(el);
    });

    card.appendChild(wrap);
  }

  /* ---- RECTANGULAR TABLE (two rows / two cols) ---- */

  function renderRectTable(table, card) {
    const seats = table.seats;
    const n = seats.length;
    const isVert = table.orientation === 'v';

    // Even-indexed seats (0,2,4…) → side A (seats 1,3,5…)
    // Odd-indexed seats  (1,3,5…) → side B (seats 2,4,6…)
    // → seat 1 always faces seat 2, seat 3 faces seat 4, etc.
    const sideA = seats.filter((_, i) => i % 2 === 0);
    const sideB = seats.filter((_, i) => i % 2 === 1);

    // getIdx: ri = position within the slice → real index in seats[]
    function makeRow(seatSlice, getIdx) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:.4rem;justify-content:center;flex-wrap:wrap;';
      seatSlice.forEach((seat, ri) => row.appendChild(makeSeatEl(seat, table.id, getIdx(ri), 'rect')));
      return row;
    }

    function makeCol(seatSlice, getIdx) {
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;gap:.4rem;';
      seatSlice.forEach((seat, ri) => col.appendChild(makeSeatEl(seat, table.id, getIdx(ri), 'rect')));
      return col;
    }

    const tableLabel = table.label || table.name || `Stół ${table.id}`;
    const tableBar = document.createElement('div');

    if (!isVert) {
      /* Horizontal: top row (seats 1,3,5…) | table bar | bottom row (seats 2,4,6…) */
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:.4rem;';
      tableBar.style.cssText = 'background:var(--bg-warm,#faf7f2);border:2px solid var(--border);border-radius:8px;padding:.3rem 1rem;font-family:var(--font-sans);font-size:.75rem;color:var(--text-light);min-width:180px;text-align:center;';
      tableBar.textContent = tableLabel;
      wrap.appendChild(makeRow(sideA, ri => ri * 2));
      wrap.appendChild(tableBar);
      wrap.appendChild(makeRow(sideB, ri => ri * 2 + 1));
      card.appendChild(wrap);
    } else {
      /* Vertical: left col (seats 1,3,5…) | table bar | right col (seats 2,4,6…) */
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:row;align-items:flex-start;gap:.4rem;justify-content:center;max-height:480px;overflow-y:auto;';
      tableBar.style.cssText = 'background:var(--bg-warm,#faf7f2);border:2px solid var(--border);border-radius:8px;padding:1rem .5rem;font-family:var(--font-sans);font-size:.75rem;color:var(--text-light);writing-mode:vertical-rl;text-align:center;min-height:120px;flex-shrink:0;';
      tableBar.textContent = tableLabel;
      wrap.appendChild(makeCol(sideA, ri => ri * 2));
      wrap.appendChild(tableBar);
      wrap.appendChild(makeCol(sideB, ri => ri * 2 + 1));
      card.appendChild(wrap);
    }
  }

  /* ---- TABLE CARD ---- */

  function renderTableCard(table) {
    const card = document.createElement('div');
    card.className = 'admin-seating-table';
    card.style.cssText = 'background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;box-shadow:var(--shadow-sm);min-width:200px;';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;';
    const h4 = document.createElement('h4');
    h4.style.cssText = 'margin:0;font-family:var(--font-script);font-size:1.2rem;color:var(--gold-dark);';
    h4.textContent = table.label || table.name || `Stół ${table.id}`;
    const freeCount = (table.seats || []).filter(s => !isTaken(s.guest)).length;
    const badge = document.createElement('span');
    badge.style.cssText = 'font-family:var(--font-sans);font-size:.75rem;color:var(--text-light);margin-left:.75rem;';
    badge.textContent = `wolne: ${freeCount}/${table.seats.length}`;
    header.appendChild(h4);
    header.appendChild(badge);
    card.appendChild(header);

    if (table.type === 'round') {
      renderRoundTable(table, card);
    } else {
      renderRectTable(table, card);
    }

    panel.appendChild(card);
  }

  function render() {
    panel.innerHTML = '';
    (seatingData.tables || []).filter(t => t.type !== 'food').forEach(table => renderTableCard(table));
  }

  /* ---- EDIT MODAL ---- */

  function openEdit(tableId, idx, seat) {
    editingRef = { tableId, idx };
    editMeta.textContent = `Stół ${tableId}, miejsce ${seat.seat}`;
    editInput.value = isTaken(seat.guest) ? seat.guest : '';
    overlay.style.display = 'flex';
    setTimeout(() => editInput.focus(), 0);
  }

  function closeEdit() { overlay.style.display = 'none'; editingRef = null; }

  async function saveEdit() {
    if (!editingRef) return;
    const seat = getSeat(editingRef.tableId, editingRef.idx);
    if (!seat) { closeEdit(); return; }
    seat.guest = editInput.value.trim() || 'Do ustalenia';
    try { await save(); render(); setStatus('Zapisano.'); } catch { setStatus('Błąd zapisu.'); }
    closeEdit();
  }

  async function swapSeats(srcTableId, srcIdx, dstTableId, dstIdx) {
    if (String(srcTableId) === String(dstTableId) && srcIdx === dstIdx) return;
    const s = getSeat(srcTableId, srcIdx);
    const d = getSeat(dstTableId, dstIdx);
    if (!s || !d) return;
    [s.guest, d.guest] = [d.guest, s.guest];
    try { await save(); render(); setStatus('Zamieniono miejsca.'); }
    catch { [s.guest, d.guest] = [d.guest, s.guest]; setStatus('Błąd zapisu.'); }
  }

  main.querySelector('#addGuestBtn').addEventListener('click', async () => {
    const name = main.querySelector('#newGuestName').value.trim();
    if (!name) { setStatus('Wpisz imię i nazwisko.'); return; }
    for (const t of seatingData.tables) {
      const i = (t.seats || []).findIndex(s => !isTaken(s.guest));
      if (i !== -1) {
        t.seats[i].guest = name;
        try { await save(); render(); setStatus(`Dodano: ${name} → ${t.label || t.name || 'Stół ' + t.id}, miejsce ${t.seats[i].seat}`); main.querySelector('#newGuestName').value = ''; }
        catch { t.seats[i].guest = 'Do ustalenia'; setStatus('Błąd zapisu.'); }
        return;
      }
    }
    setStatus('Brak wolnych miejsc.');
  });

  main.querySelector('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(seatingData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'seating.json' });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  main.querySelector('#resetBtn').addEventListener('click', async () => {
    if (!confirm('Odświeżyć dane z bazy?')) return;
    try { seatingData = await loadData(); render(); setStatus('Odświeżono.'); }
    catch { setStatus('Błąd pobierania.'); }
  });

  main.querySelector('#editCancel').addEventListener('click', closeEdit);
  main.querySelector('#editSave').addEventListener('click', saveEdit);
  editInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') closeEdit(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeEdit(); });

  async function loadData() {
    const res = await fetch(`${API_BASE}/seating`);
    if (!res.ok) throw new Error('fetch-failed');
    const data = await res.json();
    if (!data || !Array.isArray(data.tables)) throw new Error('invalid');
    return data;
  }

  loadData()
    .then(data => { seatingData = data; normalizeAllTables(); render(); setStatus('Wczytano dane.'); })
    .catch(() => setStatus('Nie udało się wczytać danych stołów z bazy.'));
}
