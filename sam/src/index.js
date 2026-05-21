'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

const QUIZ_TABLE = process.env.QUIZ_TABLE;
const FEEDBACK_TABLE = process.env.FEEDBACK_TABLE;
const SEATING_TABLE = process.env.SEATING_TABLE;
const PHOTOS_TABLE = process.env.PHOTOS_TABLE;
const VIDEOS_TABLE = process.env.VIDEOS_TABLE;
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const ASSETS_BASE_URL = String(process.env.ASSETS_BASE_URL || '').trim();
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;

const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function normPath(event) {
  const stage = event.requestContext && event.requestContext.stage
    ? `/${String(event.requestContext.stage)}`
    : '';
  let p = event.rawPath || event.path || '/';
  p = p.replace(/\/+$/, '') || '/';

  // HTTP API may pass stage-prefixed paths (e.g. /prod/api/health).
  if (stage && p === stage) {
    return '/';
  }
  if (stage && p.startsWith(`${stage}/`)) {
    return p.slice(stage.length) || '/';
  }
  return p;
}

function objectUrlFromKey(key) {
  const cleanKey = String(key || '').replace(/^\/+/, '');
  if (!cleanKey) return '';
  if (ASSETS_BASE_URL) {
    return `${ASSETS_BASE_URL.replace(/\/+$/, '')}/${cleanKey}`;
  }
  return `https://${UPLOADS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${cleanKey}`;
}

function keyFromUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return (u.pathname || '').replace(/^\/+/, '');
  } catch {
    return raw.replace(/^\/+/, '');
  }
}

async function getTotalSubmissions() {
  const meta = await ddb.send(new GetCommand({ TableName: QUIZ_TABLE, Key: { questionId: '__meta__' } }));
  return Number(meta.Item && meta.Item.totalSubmissions ? meta.Item.totalSubmissions : 0);
}

async function setTotalSubmissions(totalSubmissions) {
  await ddb.send(new PutCommand({
    TableName: QUIZ_TABLE,
    Item: { questionId: '__meta__', totalSubmissions },
  }));
}

async function getQuestionCounts(questionId, optionsLen) {
  const row = await ddb.send(new GetCommand({ TableName: QUIZ_TABLE, Key: { questionId: String(questionId) } }));
  const counts = Array.isArray(row.Item && row.Item.counts) ? row.Item.counts : [];
  const out = new Array(optionsLen).fill(0);
  for (let i = 0; i < out.length; i++) out[i] = Number(counts[i] || 0);
  return out;
}

async function setQuestionCounts(questionId, counts) {
  await ddb.send(new PutCommand({
    TableName: QUIZ_TABLE,
    Item: { questionId: String(questionId), counts },
  }));
}

async function handleQuizQuestions() {
  const totalSubmissions = await getTotalSubmissions();
  const enriched = [];

  for (const q of questions) {
    const counts = await getQuestionCounts(q.id, q.options.length);
    enriched.push({
      id: q.id,
      question: q.question,
      options: q.options,
      correct: q.correct,
      counts,
    });
  }

  return response(200, {
    totalSubmissions,
    questions: enriched,
  });
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

async function handleFeedbackList() {
  const data = await ddb.send(new ScanCommand({ TableName: FEEDBACK_TABLE }));
  const feedback = (data.Items || [])
    .map(x => ({
      feedbackId: x.feedbackId,
      name: x.name || 'Gość',
      message: x.message || '',
      createdAt: x.createdAt || '',
    }))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return response(200, { feedback });
}

async function handleFeedbackCreate(payload) {
  const name = String(payload?.name || '').trim();
  const message = String(payload?.message || '').trim();
  if (!message) return response(400, { error: 'Wiadomość jest wymagana.' });

  const feedbackId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: FEEDBACK_TABLE,
    Item: {
      feedbackId,
      name: name || 'Gość',
      message,
      createdAt,
    },
  }));

  return response(201, { success: true, feedbackId });
}

async function handlePhotosUploadUrl(payload) {
  const fileName = String(payload?.fileName || '').trim();
  const contentType = String(payload?.contentType || 'image/jpeg').trim();
  if (!fileName) return response(400, { error: 'Brakuje nazwy pliku.' });

  const ext = path.extname(fileName).toLowerCase() || '.jpg';
  const key = `photos/${Date.now()}-${crypto.randomUUID()}${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: UPLOADS_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 }
  );

  return response(200, {
    uploadUrl,
    key,
    publicUrl: objectUrlFromKey(key),
  });
}

async function handlePhotosConfirm(payload) {
  const key = String(payload?.key || '').trim();
  if (!key) return response(400, { error: 'Brakuje key.' });

  const photoId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: PHOTOS_TABLE,
    Item: {
      photoId,
      key,
      uploadedAt,
      url: objectUrlFromKey(key),
    },
  }));

  return response(201, { success: true, photoId });
}

async function handleVideosUploadUrl(payload) {
  const fileName = String(payload?.fileName || '').trim();
  const contentType = String(payload?.contentType || 'video/mp4').trim();
  const fileSize = Number(payload?.fileSize || 0);

  if (!fileName) return response(400, { error: 'Brakuje nazwy pliku.' });
  if (!contentType.startsWith('video/')) return response(400, { error: 'Dozwolone są tylko pliki wideo.' });
  if (!Number.isFinite(fileSize) || fileSize <= 0) return response(400, { error: 'Brakuje rozmiaru pliku.' });
  if (fileSize > MAX_VIDEO_BYTES) return response(400, { error: 'Plik przekracza limit 5 GB.' });

  const ext = path.extname(fileName).toLowerCase() || '.mp4';
  const key = `videos/${Date.now()}-${crypto.randomUUID()}${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: UPLOADS_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 900 }
  );

  return response(200, {
    uploadUrl,
    key,
    publicUrl: objectUrlFromKey(key),
  });
}

async function handleVideoThumbnailUploadUrl(payload) {
  const fileName = String(payload?.fileName || '').trim();
  const contentType = String(payload?.contentType || 'image/jpeg').trim();
  if (!fileName) return response(400, { error: 'Brakuje nazwy pliku miniaturki.' });
  if (!contentType.startsWith('image/')) return response(400, { error: 'Miniaturka musi być obrazem.' });

  const ext = path.extname(fileName).toLowerCase() || '.jpg';
  const key = `video-thumbnails/${Date.now()}-${crypto.randomUUID()}${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: UPLOADS_BUCKET,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 900 }
  );

  return response(200, {
    uploadUrl,
    key,
    publicUrl: objectUrlFromKey(key),
  });
}

async function handleVideosConfirm(payload) {
  const key = String(payload?.key || '').trim();
  const contentType = String(payload?.contentType || 'video/mp4').trim();
  const fileName = String(payload?.fileName || '').trim();
  const thumbnailKey = String(payload?.thumbnailKey || '').trim();
  if (!key) return response(400, { error: 'Brakuje key.' });

  const videoId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: VIDEOS_TABLE,
    Item: {
      videoId,
      key,
      contentType,
      fileName,
      thumbnailKey,
      uploadedAt,
      url: objectUrlFromKey(key),
      thumbnailUrl: thumbnailKey ? objectUrlFromKey(thumbnailKey) : '',
    },
  }));

  return response(201, { success: true, videoId });
}

async function handleVideosList() {
  const data = await ddb.send(new ScanCommand({ TableName: VIDEOS_TABLE }));
  const videos = (data.Items || [])
    .map(x => ({
      filename: x.fileName || x.key,
      key: x.key,
      url: objectUrlFromKey(x.key || keyFromUrl(x.url)),
      thumbnailUrl: objectUrlFromKey(x.thumbnailKey || keyFromUrl(x.thumbnailUrl)),
      uploadedAt: x.uploadedAt,
      contentType: x.contentType || 'video/mp4',
    }))
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  return response(200, { videos });
}

async function handlePhotosList() {
  const data = await ddb.send(new ScanCommand({ TableName: PHOTOS_TABLE }));
  const photos = (data.Items || [])
    .map(x => ({
      filename: x.key,
      key: x.key,
      url: objectUrlFromKey(x.key || keyFromUrl(x.url)),
      uploadedAt: x.uploadedAt,
    }))
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  return response(200, { photos });
}

async function handlePhotoDelete(payload) {
  const key = String(payload?.key || '').trim();
  if (!key) return response(400, { error: 'Brakuje key.' });
  const cleanKey = key.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
  if (!cleanKey) return response(400, { error: 'Niepoprawny key.' });

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: UPLOADS_BUCKET, Key: cleanKey }));
  } catch {}

  const scan = await ddb.send(new ScanCommand({
    TableName: PHOTOS_TABLE,
    FilterExpression: '#k = :k',
    ExpressionAttributeNames: { '#k': 'key' },
    ExpressionAttributeValues: { ':k': cleanKey },
  }));
  for (const item of (scan.Items || [])) {
    await ddb.send(new DeleteCommand({ TableName: PHOTOS_TABLE, Key: { photoId: item.photoId } }));
  }

  return response(200, { success: true });
}

async function handleVideoDelete(payload) {
  const key = String(payload?.key || '').trim();
  if (!key) return response(400, { error: 'Brakuje key.' });
  const cleanKey = key.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
  if (!cleanKey) return response(400, { error: 'Niepoprawny key.' });

  const scan = await ddb.send(new ScanCommand({
    TableName: VIDEOS_TABLE,
    FilterExpression: '#k = :k',
    ExpressionAttributeNames: { '#k': 'key' },
    ExpressionAttributeValues: { ':k': cleanKey },
  }));

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: UPLOADS_BUCKET, Key: cleanKey }));
  } catch {}

  for (const item of (scan.Items || [])) {
    if (item.thumbnailKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: UPLOADS_BUCKET, Key: item.thumbnailKey }));
      } catch {}
    }
    await ddb.send(new DeleteCommand({ TableName: VIDEOS_TABLE, Key: { videoId: item.videoId } }));
  }

  return response(200, { success: true });
}

async function handleSeatingGet() {
  const data = await ddb.send(new GetCommand({ TableName: SEATING_TABLE, Key: { id: 'current' } }));
  return response(200, (data.Item && data.Item.data) || { tables: [], zones: [] });
}

async function handleSeatingPut(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.tables)) {
    return response(400, { error: 'Niepoprawny format danych seating.' });
  }

  await ddb.send(new PutCommand({
    TableName: SEATING_TABLE,
    Item: {
      id: 'current',
      data: payload,
      updatedAt: new Date().toISOString(),
    },
  }));

  return response(200, { success: true });
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
    const pathName = normPath(event);

    if (method === 'OPTIONS') return response(200, { ok: true });

    if (method === 'GET' && pathName === '/api/health') return response(200, { status: 'ok' });

    if (method === 'GET' && pathName === '/api/quiz/questions') {
      return await handleQuizQuestions();
    }

    if (method === 'POST' && pathName === '/api/quiz/submit') {
      const payload = JSON.parse(event.body || '{}');
      return await handleQuizSubmit(payload);
    }

    if (method === 'GET' && pathName === '/api/feedback') {
      return await handleFeedbackList();
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

    if (method === 'GET' && pathName === '/api/videos') {
      return await handleVideosList();
    }

    if (method === 'POST' && pathName === '/api/videos/upload-url') {
      const payload = JSON.parse(event.body || '{}');
      return await handleVideosUploadUrl(payload);
    }

    if (method === 'POST' && pathName === '/api/videos/thumbnail-upload-url') {
      const payload = JSON.parse(event.body || '{}');
      return await handleVideoThumbnailUploadUrl(payload);
    }

    if (method === 'POST' && pathName === '/api/videos/confirm') {
      const payload = JSON.parse(event.body || '{}');
      return await handleVideosConfirm(payload);
    }

    if (method === 'DELETE' && pathName === '/api/photos') {
      const payload = JSON.parse(event.body || '{}');
      return await handlePhotoDelete(payload);
    }

    if (method === 'DELETE' && pathName === '/api/videos') {
      const payload = JSON.parse(event.body || '{}');
      return await handleVideoDelete(payload);
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
