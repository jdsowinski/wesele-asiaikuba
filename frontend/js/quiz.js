'use strict';

const API = '/api';

// ── State ────────────────────────────────────────────────────
const userAnswers = {}; // { questionId: answerIndex }
let questions     = [];
let totalSubmissionsSnapshot = 0;

// ── DOM refs ─────────────────────────────────────────────────
const container    = document.getElementById('questionsContainer');
const progressFill = document.getElementById('progressFill');
const progressCount= document.getElementById('progressCount');
const submitBtn    = document.getElementById('submitBtn');
const quizHint     = document.getElementById('quizHint');
const quizSection  = document.getElementById('quizSection');
const resultsSection = document.getElementById('resultsSection');
const scoreNum     = document.getElementById('scoreNum');
const scoreMsg     = document.getElementById('scoreMsg');
const guestsInfo   = document.getElementById('guestsInfo');
const resultItems  = document.getElementById('resultItems');

// ── Score messages ───────────────────────────────────────────
function getScoreMessage(score, total) {
  const pct = score / total;
  if (pct === 1)    return '🏆 Perfekcyjny wynik! Chyba byłeś/aś z nami przez te 8 lat!';
  if (pct >= 0.85)  return '🌟 Świetny wynik! Naprawdę nas znasz!';
  if (pct >= 0.65)  return '😊 Dobry wynik! Zdajesz egzamin na przyjaciela pary młodej!';
  if (pct >= 0.40)  return '😄 Nieźle! Trochę jeszcze do nas poznajesz…';
  return '😂 Może przy weselu nadrobisz zaległości! Powodzenia!';
}

// ── Load questions ───────────────────────────────────────────
async function loadQuestions() {
  try {
    const res  = await fetch(`${API}/quiz/questions?t=${Date.now()}`, { cache: 'no-store' });
    const payload = await res.json();
    if (Array.isArray(payload)) {
      // Backward compatibility with older API shape before redeploy.
      questions = payload;
      totalSubmissionsSnapshot = 0;
    } else {
      questions = Array.isArray(payload?.questions) ? payload.questions : [];
      totalSubmissionsSnapshot = Number(payload?.totalSubmissions || 0);
    }
    renderQuestions(questions);
  } catch {
    container.innerHTML = '<p style="color:#dc3545;text-align:center;">Nie udało się załadować pytań. Upewnij się, że backend działa.</p>';
  }
}

// ── Render questions ─────────────────────────────────────────
function renderQuestions(qs) {
  container.innerHTML = '';
  qs.forEach(q => {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.dataset.qid = q.id;

    card.innerHTML = `
      <div class="quiz-card__q">
        <span class="quiz-card__num">${q.id}</span>
        <span class="quiz-card__text">${escHtml(q.question)}</span>
      </div>
      <div class="quiz-card__options">
        ${q.options.map((opt, i) => `
          <label class="quiz-option" data-qid="${q.id}" data-idx="${i}">
            <input type="radio" name="q${q.id}" value="${i}" />
            ${escHtml(opt)}
          </label>
        `).join('')}
      </div>
      <div class="quiz-live" aria-live="polite"></div>
    `;

    // Listen for selection
    card.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const qid = parseInt(radio.name.slice(1), 10);
        const idx = parseInt(radio.value, 10);
        userAnswers[qid] = idx;

        // Visual feedback on labels
        card.querySelectorAll('.quiz-option').forEach((lbl, li) => {
          lbl.classList.toggle('selected', li === idx);
        });

        card.classList.add('answered');
        renderLiveFeedback(card, q, idx);
        updateProgress();
      });
    });

    container.appendChild(card);
  });
}

function renderLiveFeedback(card, question, selectedIndex) {
  const live = card.querySelector('.quiz-live');
  if (!live) return;

  if (!Number.isInteger(question.correct)) {
    live.innerHTML = '<div class="quiz-live__meta">Statystyki i poprawna odpowiedź pojawią się po odświeżeniu backendu.</div>';
    return;
  }

  const baseCounts = Array.isArray(question.counts)
    ? question.counts.slice(0, question.options.length).map(x => Number(x || 0))
    : new Array(question.options.length).fill(0);
  while (baseCounts.length < question.options.length) baseCounts.push(0);

  // Show projected stats including current user's selected answer.
  const counts = [...baseCounts];
  if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < counts.length) {
    counts[selectedIndex] += 1;
  }
  const totalVotes = counts.reduce((a, b) => a + b, 0);

  const isCorrect = selectedIndex === question.correct;
  const verdict = isCorrect
    ? '✓ Dobra odpowiedź!'
    : `✗ Poprawna odpowiedź: ${escHtml(question.options[question.correct] || '')}`;

  const optionsHtml = question.options.map((opt, i) => {
    const votes = counts[i] || 0;
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    const isUser = i === selectedIndex;
    const isGood = i === question.correct;

    let barClass = 'result-bar__fill--gold';
    let tags = '';
    if (isGood) {
      barClass = 'result-bar__fill--green';
      tags += '<span class="tag tag--correct">✓ poprawna</span>';
    }
    if (isUser && !isGood) {
      barClass = 'result-bar__fill--blue';
      tags += '<span class="tag tag--wrong">✗ Twoja</span>';
    }
    if (isUser && isGood) {
      tags = '<span class="tag tag--correct">✓ Twoja odpowiedź</span>';
    }

    return `
      <div class="result-option">
        <div class="result-option__labels">
          <span class="result-option__name">${escHtml(opt)} ${tags}</span>
          <span class="result-option__pct">${pct}%</span>
        </div>
        <div class="result-bar">
          <div class="result-bar__fill ${barClass}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  live.innerHTML = `
    <div class="quiz-live__verdict ${isCorrect ? 'quiz-live__verdict--ok' : 'quiz-live__verdict--wrong'}">${verdict}</div>
    <div class="quiz-live__meta">Szacowane statystyki po Twoim wyborze (na bazie ${totalSubmissionsSnapshot} oddanych quizów):</div>
    ${optionsHtml}
  `;
}

// ── Progress bar ─────────────────────────────────────────────
function updateProgress() {
  const answered = Object.keys(userAnswers).length;
  const total    = questions.length;
  const pct      = total > 0 ? (answered / total) * 100 : 0;
  progressFill.style.width  = `${pct}%`;
  progressCount.textContent = `${answered} / ${total}`;
}

// ── Submit ───────────────────────────────────────────────────
document.getElementById('quizForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (Object.keys(userAnswers).length < questions.length) {
    quizHint.style.display = 'block';
    // Scroll to first unanswered
    const firstUnanswered = questions.find(q => userAnswers[q.id] === undefined);
    if (firstUnanswered) {
      document.querySelector(`[data-qid="${firstUnanswered.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  quizHint.style.display = 'none';
  submitBtn.disabled     = true;
  submitBtn.textContent  = 'Wysyłanie…';

  const answers = Object.entries(userAnswers).map(([qid, idx]) => ({
    questionId:  parseInt(qid, 10),
    answerIndex: idx,
  }));

  try {
    const res  = await fetch(`${API}/quiz/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ answers }),
    });
    const data = await res.json();
    showResults(data);
  } catch {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Wyślij odpowiedzi ♥';
    alert('Wystąpił błąd przy wysyłaniu. Spróbuj ponownie.');
  }
});

// ── Show results ─────────────────────────────────────────────
function showResults(data) {
  // Hide form, show results
  quizSection.style.display   = 'none';
  resultsSection.classList.add('active');
  resultsSection.scrollIntoView({ behavior: 'smooth' });

  // Score card
  scoreNum.textContent  = data.score;
  scoreMsg.textContent  = getScoreMessage(data.score, data.totalQuestions);
  guestsInfo.textContent = `Odpowiedzi udzieliło już ${data.totalSubmissions} ${pluralGuests(data.totalSubmissions)}`;

  // Build per-question result cards
  resultItems.innerHTML = '';
  data.results.forEach(r => {
    const totalVotes = r.counts.reduce((a, b) => a + b, 0);
    const isCorrect  = r.userAnswer === r.correct;

    const card = document.createElement('div');
    card.className = 'result-card';

    const optionsHtml = r.options.map((opt, i) => {
      const votes = r.counts[i] || 0;
      const pct   = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;

      const isUserAnswer    = i === r.userAnswer;
      const isCorrectAnswer = i === r.correct;

      let barClass  = 'result-bar__fill--gold';
      let tags      = '';

      if (isCorrectAnswer) {
        barClass = 'result-bar__fill--green';
        tags    += '<span class="tag tag--correct">✓ poprawna</span>';
      }
      if (isUserAnswer && !isCorrectAnswer) {
        barClass = 'result-bar__fill--blue';
        tags    += '<span class="tag tag--wrong">✗ Twoja</span>';
      }
      if (isUserAnswer && isCorrectAnswer) {
        tags = '<span class="tag tag--correct">✓ Twoja odpowiedź</span>';
      }

      return `
        <div class="result-option">
          <div class="result-option__labels">
            <span class="result-option__name">${escHtml(opt)} ${tags}</span>
            <span class="result-option__pct">${pct}%</span>
          </div>
          <div class="result-bar">
            <div class="result-bar__fill ${barClass}" style="width:0%" data-width="${pct}"></div>
          </div>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="result-card__q">
        <div class="result-card__badge result-card__badge--${isCorrect ? 'correct' : 'wrong'}">
          ${isCorrect ? '✓' : '✗'}
        </div>
        <span class="result-card__text">${r.questionId}. ${escHtml(r.question)}</span>
      </div>
      ${optionsHtml}
    `;
    resultItems.appendChild(card);
  });

  // Animate bars after a short delay
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('[data-width]').forEach(bar => {
        bar.style.width = `${bar.dataset.width}%`;
      });
    }, 200);
  });
}

// ── Helpers ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pluralGuests(n) {
  if (n === 1) return 'gość';
  if (n >= 2 && n <= 4) return 'gości';
  return 'gości';
}

// ── Init ──────────────────────────────────────────────────────
loadQuestions();
