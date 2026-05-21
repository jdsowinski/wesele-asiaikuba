'use strict';

const AWS = require('aws-sdk');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ddb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ signatureVersion: 'v4' });

const QUIZ_TABLE = process.env.QUIZ_TABLE;
const FEEDBACK_TABLE = process.env.FEEDBACK_TABLE;
const SEATING_TABLE = process.env.SEATING_TABLE;
const PHOTOS_TABLE = process.env.PHOTOS_TABLE;
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function normPath(event) {
  const p = event.rawPath || event.path || '/';
  return p.replace(/\/+$/, '') || '/';
}

async function getTotalSubmissions() {
  const meta = await ddb.get({ TableName: QUIZ_TABLE, Key: { questionId: '__meta__' } }).promise();
  return Number(meta.Item?.totalSubmissions || 0);
}

async function setTotalSubmissions(totalSubmissions) {
  await ddb.put({
    TableName: QUIZ_TABLE,
    Item: { questionId: '__meta__', totalSubmissions },
  }).promise();
}

async function getQuestionCounts(questionId, optionsLen) {
  const row = await ddb.get({ TableName: QUIZ_TABLE, Key: { questionId: String(questionId) } }).promise();
  const counts = Array.isArray(row.Item?.counts) ? row.Item.counts : [];
  const out = new Array(optionsLen).fill(0);
  for (let i = 0; i < out.length; i++) out[i] = Number(counts[i] || 0);
  return out;
}

async function setQuestionCounts(questionId, counts) {
  await ddb.put({
    TableName: QUIZ_TABLE,
    Item: { questionId: String(questionId), counts },
  }).promise();
}

async function handleQuizSubmit(payload) {
  const answers = Array.isArray(payload?.answers) ? payload.answers : null;
  if (!answers || answers.length === 0) {
    return response(400, { error: 'Brakuje odpowiedzi.' });
  }

  let score = 0;
  const countsMap = {};

  for (const q of questions) {
    countsMap[q.id] = await getQuestionCounts(q.id, q.options.length);
  }

  for (const ans of answers) {
    const q = questions.find(x => x.id === ans.questionId);
    if (!q) continue;
    const idx = Number(ans.answerIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) continue;
    countsMap[q.id][idx] += 1;
  }

  for (const q of questions) {
    const user = answers.find(a => a.questionId === q.id);
    if (user && Number(user.answerIndex) === q.correct) score += 1;
  }

  let totalSubmissions = await getTotalSubmissions();
  totalSubmissions += 1;
  await setTotalSubmissions(totalSubmissions);

  for (const q of questions) {
    await setQuestionCounts(q.id, countsMap[q.id]);
  }

  const results = questions.map(q => {
    const user = answers.find(a => a.questionId === q.id);
    return {
      questionId: q.id,
      question: q.question,
      options: q.options,
      correct: q.correct,
      userAnswer: user ? Number(user.answerIndex) : null,
      counts: countsMap[q.id],
    };
  });

  return response(200, {
    score,
    totalQuestions: questions.length,
    totalSubmissions,
    results,
  });
}

async function handleFeedbackCreate(payload) {
  const name = String(payload?.name || '').trim();
  const message = String(payload?.message || '').trim();
  if (!message) return response(400, { error: 'Wiadomość jest wymagana.' });

  const feedbackId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await ddb.put({
    TableName: FEEDBACK_TABLE,
    Item: {
      feedbackId,
      name: name || 'Gość',
      message,
      createdAt,
    },
  }).promise();

  return response(201, { success: true, feedbackId });
}

async function handlePhotosUploadUrl(payload) {
  const fileName = String(payload?.fileName || '').trim();
  const contentType = String(payload?.contentType || 'image/jpeg').trim();
  if (!fileName) return response(400, { error: 'Brakuje nazwy pliku.' });

  const ext = path.extname(fileName).toLowerCase() || '.jpg';
  const key = `${Date.now()}-${crypto.randomUUID()}${ext}`;

  const uploadUrl = await s3.getSignedUrlPromise('putObject', {
    Bucket: UPLOADS_BUCKET,
    Key: key,
    ContentType: contentType,
    Expires: 300,
  });

  return response(200, {
    uploadUrl,
    key,
    publicUrl: `https://${UPLOADS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
  });
}

async function handlePhotosConfirm(payload) {
  const key = String(payload?.key || '').trim();
  if (!key) return response(400, { error: 'Brakuje key.' });

  const photoId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();

  await ddb.put({
    TableName: PHOTOS_TABLE,
    Item: {
      photoId,
      key,
      uploadedAt,
      url: `https://${UPLOADS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    },
  }).promise();

  return response(201, { success: true, photoId });
}

async function handlePhotosList() {
  const data = await ddb.scan({ TableName: PHOTOS_TABLE }).promise();
  const photos = (data.Items || [])
    .map(x => ({
      filename: x.key,
      url: x.url,
      uploadedAt: x.uploadedAt,
    }))
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  return response(200, { photos });
}

async function handleSeatingGet() {
  const data = await ddb.get({ TableName: SEATING_TABLE, Key: { id: 'current' } }).promise();
  return response(200, data.Item?.data || { tables: [], zones: [] });
}

async function handleSeatingPut(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.tables)) {
    return response(400, { error: 'Niepoprawny format danych seating.' });
  }

  await ddb.put({
    TableName: SEATING_TABLE,
    Item: {
      id: 'current',
      data: payload,
      updatedAt: new Date().toISOString(),
    },
  }).promise();

  return response(200, { success: true });
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    const pathName = normPath(event);

    if (method === 'OPTIONS') return response(200, { ok: true });

    if (method === 'GET' && pathName === '/api/health') return response(200, { status: 'ok' });

    if (method === 'GET' && pathName === '/api/quiz/questions') {
      const publicQuestions = questions.map(({ id, question, options }) => ({ id, question, options }));
      return response(200, publicQuestions);
    }

    if (method === 'POST' && pathName === '/api/quiz/submit') {
      const payload = JSON.parse(event.body || '{}');
      return await handleQuizSubmit(payload);
    }

    if (method === 'POST' && pathName === '/api/feedback') {
      const payload = JSON.parse(event.body || '{}');
      return await handleFeedbackCreate(payload);
    }

    if (method === 'GET' && pathName === '/api/photos') {
      return await handlePhotosList();
    }

    if (method === 'POST' && pathName === '/api/photos/upload-url') {
      const payload = JSON.parse(event.body || '{}');
      return await handlePhotosUploadUrl(payload);
    }

    if (method === 'POST' && pathName === '/api/photos/confirm') {
      const payload = JSON.parse(event.body || '{}');
      return await handlePhotosConfirm(payload);
    }

    if (method === 'GET' && pathName === '/api/seating') {
      return await handleSeatingGet();
    }

    if (method === 'PUT' && pathName === '/api/seating') {
      const payload = JSON.parse(event.body || '{}');
      return await handleSeatingPut(payload);
    }

    return response(404, { error: 'Not found' });
  } catch (err) {
    return response(500, { error: 'Internal error', details: err.message });
  }
};
