'use strict';

const STORAGE_KEY = 'weddingSeatingData';

const adminTables = document.getElementById('adminTables');
const newGuestName = document.getElementById('newGuestName');
const addGuestBtn = document.getElementById('addGuestBtn');
const exportBtn = document.getElementById('exportBtn');
const resetBtn = document.getElementById('resetBtn');
const adminStatus = document.getElementById('adminStatus');
const adminEditModal = document.getElementById('adminEditModal');
const adminEditSeatMeta = document.getElementById('adminEditSeatMeta');
const adminEditInput = document.getElementById('adminEditInput');
const adminEditCancel = document.getElementById('adminEditCancel');
const adminEditSave = document.getElementById('adminEditSave');

let seatingData = null;
let baseData = null;
let editingSeatRef = null;

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isSeatTaken(guest) {
  const n = normalize(guest);
  return n !== '' && n !== 'do ustalenia' && n !== 'wolne' && n !== 'tbd';
}

function status(text) {
  adminStatus.textContent = text;
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seatingData));
}

function ensureTableOneLayout(data) {
  const tableOne = (data.tables || []).find(t => String(t.id) === '1');
  if (!tableOne) return;

  // Keep table 1 visually consistent with other tables in admin.
  tableOne.columns = 2;
  if (!Array.isArray(tableOne.seats)) tableOne.seats = [];

  for (let i = tableOne.seats.length + 1; i <= 24; i++) {
    tableOne.seats.push({ seat: String(i), guest: 'Do ustalenia' });
  }
  if (tableOne.seats.length > 24) {
    tableOne.seats = tableOne.seats.slice(0, 24);
  }
}

function getSeat(tableId, seatIndex) {
  const table = seatingData.tables.find(t => String(t.id) === String(tableId));
  if (!table) return null;
  return table.seats[seatIndex] || null;
}

function getSeatDisplayEntries(table) {
  const entries = (table.seats || []).map((seat, sourceIndex) => ({
    seat,
    sourceIndex,
    number: Number.parseInt(seat.seat, 10),
  }));

  if (String(table.id) !== '1') {
    return entries;
  }

  // Table 1 in admin: rotated real-world order (2,1 / 4,3 / 6,5 ...).
  return [...entries].sort((a, b) => {
    const aNum = Number.isFinite(a.number) ? a.number : 10000 + a.sourceIndex;
    const bNum = Number.isFinite(b.number) ? b.number : 10000 + b.sourceIndex;
    const aPair = Math.ceil(aNum / 2);
    const bPair = Math.ceil(bNum / 2);
    if (aPair !== bPair) return aPair - bPair;
    const aInPair = aNum % 2 === 0 ? 0 : 1;
    const bInPair = bNum % 2 === 0 ? 0 : 1;
    return aInPair - bInPair;
  });
}

function render() {
  adminTables.innerHTML = '';

  seatingData.tables.forEach(table => {
    const card = document.createElement('section');
    card.className = 'admin-table-card';
    const tableColumns = table.columns || (table.type === 'head' ? 6 : 2);

    const title = document.createElement('h3');
    title.className = 'admin-table-card__title';
    title.textContent = table.label || `Stół ${table.id}`;
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'admin-seat-grid';
    grid.style.gridTemplateColumns = `repeat(${tableColumns}, minmax(0, 1fr))`;

    getSeatDisplayEntries(table).forEach(entry => {
      const seat = entry.seat;
      const sourceIndex = entry.sourceIndex;
      const wrap = document.createElement('div');
      wrap.className = `admin-seat${isSeatTaken(seat.guest) ? ' admin-seat--taken' : ''}`;
      wrap.dataset.tableId = table.id;
      wrap.dataset.seatIndex = String(sourceIndex);
      wrap.draggable = true;

      wrap.addEventListener('dragstart', event => {
        event.dataTransfer.setData('text/plain', JSON.stringify({
          tableId: table.id,
          seatIndex: sourceIndex,
        }));
        wrap.classList.add('admin-seat--dragging');
      });
      wrap.addEventListener('dragend', () => {
        wrap.classList.remove('admin-seat--dragging');
      });
      wrap.addEventListener('dragover', event => {
        event.preventDefault();
        wrap.classList.add('admin-seat--drop');
      });
      wrap.addEventListener('dragleave', () => {
        wrap.classList.remove('admin-seat--drop');
      });
      wrap.addEventListener('drop', event => {
        event.preventDefault();
        wrap.classList.remove('admin-seat--drop');

        try {
          const source = JSON.parse(event.dataTransfer.getData('text/plain'));
          swapSeats(source.tableId, source.seatIndex, table.id, sourceIndex);
        } catch {
          status('Nie udało się przenieść miejsca.');
        }
      });

      const seatNo = document.createElement('span');
      seatNo.className = 'admin-seat__number';
      seatNo.textContent = `Miejsce ${seat.seat}`;

      const guest = document.createElement('span');
      guest.className = 'admin-seat__guest';
      guest.textContent = isSeatTaken(seat.guest) ? seat.guest : 'Wolne miejsce';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'admin-seat__edit';
      editBtn.textContent = 'Edytuj';
      editBtn.addEventListener('click', () => {
        openEditModal(table.id, sourceIndex, seat);
      });

      wrap.appendChild(seatNo);
      wrap.appendChild(guest);
      wrap.appendChild(editBtn);
      grid.appendChild(wrap);
    });

    card.appendChild(grid);
    adminTables.appendChild(card);
  });
}

function openEditModal(tableId, seatIndex, seat) {
  editingSeatRef = { tableId, seatIndex };
  adminEditSeatMeta.textContent = `Stół ${tableId}, miejsce ${seat.seat}`;
  adminEditInput.value = isSeatTaken(seat.guest) ? seat.guest : '';
  adminEditModal.classList.add('active');
  adminEditModal.setAttribute('aria-hidden', 'false');
  setTimeout(() => adminEditInput.focus(), 0);
}

function closeEditModal() {
  editingSeatRef = null;
  adminEditModal.classList.remove('active');
  adminEditModal.setAttribute('aria-hidden', 'true');
}

function saveEditedGuest() {
  if (!editingSeatRef) return;
  const seat = getSeat(editingSeatRef.tableId, editingSeatRef.seatIndex);
  if (!seat) {
    closeEditModal();
    return;
  }

  seat.guest = adminEditInput.value.trim() || 'Do ustalenia';
  saveLocal();
  render();
  closeEditModal();
  status('Zmieniono dane gościa.');
}

function swapSeats(sourceTableId, sourceSeatIndex, targetTableId, targetSeatIndex) {
  if (String(sourceTableId) === String(targetTableId) && sourceSeatIndex === targetSeatIndex) {
    return;
  }

  const source = getSeat(sourceTableId, sourceSeatIndex);
  const target = getSeat(targetTableId, targetSeatIndex);
  if (!source || !target) return;

  const sourceGuest = source.guest;
  source.guest = target.guest;
  target.guest = sourceGuest;

  saveLocal();
  render();
  status('Zmieniono miejsca gości.');
}

function findFirstFreeSeat() {
  for (const table of seatingData.tables) {
    for (let i = 0; i < table.seats.length; i++) {
      if (!isSeatTaken(table.seats[i].guest)) {
        return { table, index: i };
      }
    }
  }
  return null;
}

function addGuestToFirstAvailable() {
  const guest = newGuestName.value.trim();
  if (!guest) {
    status('Wpisz imię i nazwisko gościa.');
    return;
  }

  const free = findFirstFreeSeat();
  if (!free) {
    status('Brak wolnych miejsc.');
    return;
  }

  free.table.seats[free.index].guest = guest;
  saveLocal();
  render();

  status(`Dodano: ${guest} - ${free.table.label || `Stół ${free.table.id}`}, miejsce ${free.table.seats[free.index].seat}`);
  newGuestName.value = '';
}

function exportJson() {
  const blob = new Blob([JSON.stringify(seatingData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'seating-updated.json';
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  status('Wyeksportowano JSON z aktualnym układem.');
}

function resetLocalChanges() {
  const ok = confirm('Usunąć lokalne zmiany i wrócić do pliku bazowego?');
  if (!ok) return;

  localStorage.removeItem(STORAGE_KEY);
  seatingData = JSON.parse(JSON.stringify(baseData));
  render();
  status('Przywrócono bazowy układ stołów.');
}

async function init() {
  const response = await fetch('data/seating.json');
  baseData = await response.json();
  ensureTableOneLayout(baseData);

  const localRaw = localStorage.getItem(STORAGE_KEY);
  if (localRaw) {
    try {
      seatingData = JSON.parse(localRaw);
      ensureTableOneLayout(seatingData);
      status('Wczytano lokalne zmiany admina.');
    } catch {
      seatingData = JSON.parse(JSON.stringify(baseData));
      status('Nie udało się wczytać zmian lokalnych. Użyto danych bazowych.');
    }
  } else {
    seatingData = JSON.parse(JSON.stringify(baseData));
    status('Wczytano dane bazowe.');
  }

  ensureTableOneLayout(seatingData);

  render();
}

addGuestBtn.addEventListener('click', addGuestToFirstAvailable);
exportBtn.addEventListener('click', exportJson);
resetBtn.addEventListener('click', resetLocalChanges);
adminEditCancel.addEventListener('click', closeEditModal);
adminEditSave.addEventListener('click', saveEditedGuest);
adminEditInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveEditedGuest();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeEditModal();
  }
});
adminEditModal.addEventListener('click', event => {
  if (event.target === adminEditModal) {
    closeEditModal();
  }
});
newGuestName.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addGuestToFirstAvailable();
  }
});

init().catch(() => {
  status('Nie udało się wczytać danych stołów.');
});
