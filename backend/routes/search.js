const express = require('express');
const auth = require('../middleware/auth');
const axios = require('axios');
const File = require('../models/File');
const aiService = require('../services/aiService');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  const { q } = req.body;
  try {
    const aiRes = await aiService.semanticSearch(q, req.user.id);
    const { results } = aiRes; // results has fileId and score
    const ids = results.map(r => r.fileId);
    const files = await File.find({ _id: { $in: ids }, userId: req.user.id }).lean();
    const fileMap = files.reduce((acc, f) => { acc[f._id.toString()] = f; return acc; }, {});
    const fullResults = results.map(r => ({ file: fileMap[r.fileId] || null, score: r.score })).filter(r => r.file);
    res.json({ results: fullResults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/keyword', auth, async (req, res) => {
  const { q } = req.body;
  try {
    const files = await File.find({ $text: { $search: q }, userId: req.user.id }).lean();
    res.json({ results: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
