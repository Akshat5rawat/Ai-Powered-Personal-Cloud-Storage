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

/**
 * Generate AI summary for a file
 * @param {string} fileId - MongoDB file ID
 * @param {string} minioKey - Storage key for the file
 * @param {string} mimetype - File MIME type
 * @returns {Promise<Object>} Summary result
 */
async function summarizeFile(fileId, minioKey, mimetype) {
  const res = await axios.post(`${AI_URL}/summarize`, { fileId, minioKey, mimetype });
  return res.data;
}

/**
 * Get existing summary for a file
 * @param {string} fileId - MongoDB file ID
 * @returns {Promise<Object>} Summary data
 */
async function getSummary(fileId) {
  const res = await axios.get(`${AI_URL}/summary/${fileId}`);
  return res.data;
}

/**
 * Check if a file type is summarizable
 * @param {string} mimetype - File MIME type
 * @returns {boolean} Whether the file can be summarized
 */
function isSummarizable(mimetype) {
  if (!mimetype) return false;
  const summarizable = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp'
  ];
  return summarizable.some(s => mimetype.toLowerCase().includes(s));
}

module.exports = { processFile, getQueryEmbedding, semanticSearch, summarizeFile, getSummary, isSummarizable };