'use strict';

const STORAGE_KEY = 'weddingSeatingData';

const seatMapCanvas = document.getElementById('seatMapCanvas');
const guestSearch = document.getElementById('guestSearch');
const searchBtn = document.getElementById('searchBtn');
const clearBtn = document.getElementById('clearBtn');
const searchStatus = document.getElementById('searchStatus');
const guestSuggestions = document.getElementById('guestSuggestions');

let renderedSeats = [];
let toastHideTimer = null;

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

function ensureTableOneLayout(data) {
  const tableOne = (data.tables || []).find(t => String(t.id) === '1');
  if (!tableOne) return;

  tableOne.columns = 12;
  if (!Array.isArray(tableOne.seats)) tableOne.seats = [];

  for (let i = tableOne.seats.length + 1; i <= 24; i++) {
    tableOne.seats.push({ seat: String(i), guest: 'Do ustalenia' });
  }
  if (tableOne.seats.length > 24) {
    tableOne.seats = tableOne.seats.slice(0, 24);
  }
}

function renderZone(zone) {
  const div = document.createElement('div');
  div.className = 'seat-zone';
  div.style.left = `${zone.x}px`;
  div.style.top = `${zone.y}px`;
  div.style.width = `${zone.width}px`;
  div.style.height = `${zone.height}px`;
  if (zone.background) div.style.background = zone.background;
  if (zone.borderColor) div.style.borderColor = zone.borderColor;
  div.textContent = zone.label || '';
  seatMapCanvas.appendChild(div);
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

  // Table 1 on public map: first row odd seats, second row even seats.
  return [...entries].sort((a, b) => {
    const aNum = Number.isFinite(a.number) ? a.number : 10000 + a.sourceIndex;
    const bNum = Number.isFinite(b.number) ? b.number : 10000 + b.sourceIndex;
    const aGroup = aNum % 2 === 1 ? 0 : 1;
    const bGroup = bNum % 2 === 1 ? 0 : 1;
    if (aGroup !== bGroup) return aGroup - bGroup;
    return aNum - bNum;
  });
}

function renderTable(table) {
  const tableEl = document.createElement('div');
  tableEl.className = `map-table map-table--${table.type === 'head' ? 'head' : 'long'}`;
  tableEl.style.left = `${table.x}px`;
  tableEl.style.top = `${table.y}px`;
  tableEl.style.width = `${table.width}px`;
  tableEl.style.height = `${table.height}px`;
  if (table.columns && Number.isInteger(table.columns) && table.columns > 0) {
    tableEl.style.gridTemplateColumns = `repeat(${table.columns}, minmax(0, 1fr))`;
  }

  const title = document.createElement('span');
  title.className = 'map-table__title';
  title.textContent = table.label || `Stół ${table.id}`;
  tableEl.appendChild(title);

  getSeatDisplayEntries(table).forEach(entry => {
    const seat = entry.seat;
    const guestName = isSeatTaken(seat.guest) ? seat.guest : '';
    const seatEl = document.createElement('div');
    seatEl.className = 'seat';
    seatEl.textContent = seat.seat;
    seatEl.title = guestName
      ? `${guestName} · Stół ${table.id}, miejsce ${seat.seat}`
      : `Wolne miejsce · Stół ${table.id}, miejsce ${seat.seat}`;
    seatEl.dataset.guest = guestName;
    seatEl.dataset.table = table.id;
    seatEl.dataset.seat = seat.seat;
    seatEl.addEventListener('click', () => {
      focusSeat(seatEl);
      showSeatToast(`${seatEl.dataset.guest} - stół ${seatEl.dataset.table}, miejsce ${seatEl.dataset.seat}`);
    });
    tableEl.appendChild(seatEl);
    renderedSeats.push(seatEl);
  });

  seatMapCanvas.appendChild(tableEl);
}

function clearMatches() {
  renderedSeats.forEach(seat => seat.classList.remove('seat--match'));
}

function focusSeat(seat) {
  clearMatches();
  seat.classList.add('seat--match');
  seat.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  searchStatus.textContent = `Znaleziono: ${seat.dataset.guest} - stół ${seat.dataset.table}, miejsce ${seat.dataset.seat}`;
}

function showSeatToast(message) {
  let toast = document.getElementById('seatToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'seatToast';
    toast.className = 'seat-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('active');

  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }
  toastHideTimer = setTimeout(() => {
    toast.classList.remove('active');
  }, 2600);
}

function findMatches(queryRaw) {
  const query = normalize(queryRaw);
  if (!query) return [];
  return renderedSeats.filter(seat => seat.dataset.guest && normalize(seat.dataset.guest).includes(query));
}

function renderSuggestions(matches) {
  guestSuggestions.innerHTML = '';
  if (matches.length === 0) return;

  matches.slice(0, 8).forEach(seat => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'seating-suggestion';
    item.innerHTML = `<strong>${seat.dataset.guest}</strong> - stół ${seat.dataset.table}, miejsce ${seat.dataset.seat}`;
    item.addEventListener('click', () => {
      guestSearch.value = seat.dataset.guest;
      guestSuggestions.innerHTML = '';
      focusSeat(seat);
    });
    guestSuggestions.appendChild(item);
  });
}

function findGuest() {
  const queryRaw = guestSearch.value;
  const matches = findMatches(queryRaw);

  clearMatches();
  guestSuggestions.innerHTML = '';

  if (!normalize(queryRaw)) {
    searchStatus.textContent = 'Wpisz imię i nazwisko gościa.';
    return;
  }

  if (matches.length === 0) {
    searchStatus.textContent = 'Nie znaleziono takiego gościa. Sprawdź pisownię.';
    return;
  }

  if (matches.length === 1) {
    focusSeat(matches[0]);
    return;
  }

  renderSuggestions(matches);
  searchStatus.textContent = `Znaleziono ${matches.length} wyników. Wybierz osobę z listy podpowiedzi.`;
}

function clearSearch() {
  guestSearch.value = '';
  clearMatches();
  guestSuggestions.innerHTML = '';
  searchStatus.textContent = '';
}

async function initSeating() {
  try {
    let data = null;
    const localRaw = localStorage.getItem(STORAGE_KEY);
    if (localRaw) {
      try {
        data = JSON.parse(localRaw);
      } catch {
        data = null;
      }
    }

    if (!data) {
      const response = await fetch('data/seating.json');
      data = await response.json();
    }

    ensureTableOneLayout(data);

    (data.zones || []).forEach(renderZone);
    (data.tables || []).forEach(renderTable);

    searchStatus.textContent = 'Mapa gotowa. Wpisz imię i nazwisko, aby znaleźć miejsce.';
  } catch {
    searchStatus.textContent = 'Nie udało się wczytać mapy stołów.';
  }
}

searchBtn.addEventListener('click', findGuest);
clearBtn.addEventListener('click', clearSearch);
guestSearch.addEventListener('input', () => {
  const matches = findMatches(guestSearch.value);
  if (!normalize(guestSearch.value)) {
    guestSuggestions.innerHTML = '';
    searchStatus.textContent = '';
    clearMatches();
    return;
  }
  if (matches.length === 1) {
    guestSuggestions.innerHTML = '';
    focusSeat(matches[0]);
    return;
  }
  clearMatches();
  renderSuggestions(matches);
  searchStatus.textContent = matches.length
    ? `Pasujące osoby: ${matches.length}. Kliknij właściwą osobę.`
    : 'Brak podpowiedzi dla wpisanej frazy.';
});
guestSearch.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    findGuest();
  }
});

initSeating();
