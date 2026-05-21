// Panel admina - dynamiczne ładowanie sekcji

const main = document.getElementById('adminMain');
const navLinks = document.querySelectorAll('.admin-nav__link');

function setActiveLink(section) {
  navLinks.forEach(link => {
    const linkSection = link.getAttribute('href').replace('#', '');
    link.classList.toggle('active', linkSection === section);
  });
}

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const section = link.getAttribute('href').replace('#', '');
    window.location.hash = '#' + section;
    setActiveLink(section);
    loadSection(section);
  });
});

window.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.replace('#', '') || 'seating';
  setActiveLink(hash);
  loadSection(hash);
});

function loadSection(section) {
  main.innerHTML = '<div class="admin-loading">Ładowanie…</div>';
  if (section === 'seating') {
    import('./seating-admin.js').then(m => m.renderSeating(main));
  } else if (section === 'schemat') {
    import('./schemat-admin.js').then(m => m.renderSchemat(main));
  } else if (section === 'photos') {
    import('./photos-admin.js').then(m => m.renderPhotos(main));
  } else if (section === 'videos') {
    import('./videos-admin.js').then(m => m.renderVideos(main));
  } else if (section === 'feedback') {
    import('./feedback-admin.js').then(m => m.renderFeedback(main));
  } else {
    main.innerHTML = '<div class="admin-loading">Nieznana sekcja</div>';
  }
}
