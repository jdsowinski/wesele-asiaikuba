// feedback-admin.js
export function renderFeedback(main) {
  main.innerHTML = `<h2>Opinie</h2><div id="feedbackAdminPanel" class="admin-feedback-list">Ładowanie opinii…</div>`;
  const panel = document.getElementById('feedbackAdminPanel');
  async function fetchFeedback() {
    try {
      const res = await fetch('https://api-wesele.asiaikuba.pl/api/feedback');
      const data = await res.json();
      if (Array.isArray(data.feedback) && data.feedback.length > 0) {
        panel.innerHTML = data.feedback
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
          .map(f => `<div class="admin-feedback-item"><b>${f.name || 'Gość'}</b>${f.message || f.text || ''}</div>`)
          .join('');
      } else {
        panel.innerHTML = '<div class="admin-feedback-item"><em>Brak opinii</em></div>';
      }
    } catch {
      panel.innerHTML = '<div class="admin-feedback-item"><em>Błąd pobierania opinii</em></div>';
    }
  }
  fetchFeedback();
}
