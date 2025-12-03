const axios = require('axios');

const AI_URL = process.env.AI_SERVICE_URL;

async function processFile(fileId, minioKey, mimetype) {
  const res = await axios.post(`${AI_URL}/process-file`, { fileId, minioKey, mimetype });
  return res.data;
}

async function getQueryEmbedding(q) {
  const res = await axios.post(`${AI_URL}/semantic-search`, { query: q });
  return res.data.embedding;
}

async function semanticSearch(q, userId) {
  const res = await axios.post(`${AI_URL}/semantic-search`, { query: q, userId });
  return res.data; // {results: [...] }
}

module.exports = { processFile, getQueryEmbedding, semanticSearch };