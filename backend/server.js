'use strict';

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app         = express();
const PORT        = process.env.PORT || 3001;
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/app/uploads';
const FEEDBACK_FILE = path.join(UPLOADS_DIR, 'feedback.json');

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Ensure uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(FEEDBACK_FILE)) {
  fs.writeFileSync(FEEDBACK_FILE, '[]', 'utf8');
}

// ── Quiz data ────────────────────────────────────────────────────────────────

const questions = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8')
);

// In-memory answer counts: { questionId: [count_opt0, count_opt1, ...] }
const answerCounts = {};
let totalSubmissions = 0;

questions.forEach(q => {
  answerCounts[q.id] = new Array(q.options.length).fill(0);
});

// ── Quiz endpoints ───────────────────────────────────────────────────────────

// Return questions without revealing correct answers
app.get('/api/quiz/questions', (_req, res) => {
  const publicQuestions = questions.map(({ id, question, options }) => ({
    id,
    question,
    options,
  }));
  res.json(publicQuestions);
});

app.post('/api/quiz/submit', (req, res) => {
  const { answers } = req.body; // [{ questionId, answerIndex }]

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: 'Brakuje odpowiedzi.' });
  }

  answers.forEach(({ questionId, answerIndex }) => {
    const counts = answerCounts[questionId];
    if (
      counts &&
      Number.isInteger(answerIndex) &&
      answerIndex >= 0 &&
      answerIndex < counts.length
    ) {
      counts[answerIndex]++;
    }
  });

  totalSubmissions++;

  let score = 0;
  const results = questions.map(q => {
    const userAnswer = answers.find(a => a.questionId === q.id);
    const userIndex  = userAnswer != null ? userAnswer.answerIndex : null;
    if (userIndex === q.correct) score++;

    return {
      questionId: q.id,
      question:   q.question,
      options:    q.options,
      correct:    q.correct,
      userAnswer: userIndex,
      counts:     [...answerCounts[q.id]],
    };
  });

  res.json({
    score,
    totalQuestions:   questions.length,
    totalSubmissions,
    results,
  });
});

// ── Photo endpoints ──────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ts   = Date.now();
    const rand = Math.floor(Math.random() * 1e6);
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${ts}-${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    if (/^image\//i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(new Error('Tylko pliki obrazów są dozwolone.'), {
          code: 'NOT_IMAGE',
        })
      );
    }
  },
});

app.post('/api/photos/upload', upload.array('photos', 30), (req, res) => {
  const files = (req.files || []).map(f => ({
    filename: f.filename,
    url:      `/uploads/${f.filename}`,
    size:     f.size,
  }));
  res.json({ success: true, files });
});

app.get('/api/photos', (_req, res) => {
  let photos = [];
  try {
    photos = fs
      .readdirSync(UPLOADS_DIR)
      .filter(f => /\.(jpe?g|png|gif|webp|avif)$/i.test(f))
      .map(f => {
        const stats = fs.statSync(path.join(UPLOADS_DIR, f));
        return {
          filename:   f,
          url:        `/uploads/${f}`,
          uploadedAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  } catch {
    // directory may be empty or unreadable – return empty list
  }
  res.json({ photos });
});

// ── Feedback endpoint ───────────────────────────────────────────────────────

app.post('/api/feedback', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!message) {
    return res.status(400).json({ error: 'Wiadomość jest wymagana.' });
  }

  if (name.length > 80 || message.length > 1500) {
    return res.status(400).json({ error: 'Przekroczono limit długości.' });
  }

  let feedback = [];
  try {
    feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'));
    if (!Array.isArray(feedback)) feedback = [];
  } catch {
    feedback = [];
  }

  feedback.push({
    name: name || 'Gość',
    message,
    createdAt: new Date().toISOString(),
  });

  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2), 'utf8');
  return res.status(201).json({ success: true });
});

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', totalSubmissions })
);

// ── Error handler ────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.code === 'NOT_IMAGE' ? 415 : 500;
  res.status(status).json({ error: err.message });
});

app.listen(PORT, () =>
  console.log(`Backend running on port ${PORT}`)
);
