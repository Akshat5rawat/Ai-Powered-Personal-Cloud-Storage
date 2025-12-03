const express = require('express');
const auth = require('../middleware/auth');
const aiService = require('../services/aiService');
const File = require('../models/File');

const router = express.Router();

router.post('/process/:id', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    if (file.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    const aiData = await aiService.processFile(file._id.toString(), file.minioKey, file.mimetype);
    if (aiData.category) file.category = aiData.category;
    if (aiData.embedding) file.embedding = aiData.embedding;
    if (aiData.hash) file.hash = aiData.hash;
    if (aiData.pHash) file.pHash = aiData.pHash;

    // duplicate detection
    if (aiData.hash) {
      const existing = await File.findOne({ hash: aiData.hash, _id: { $ne: file._id } });
      if (existing) {
        file.duplicate = true;
        file.duplicateOf = existing._id;
      }
    }
    if (!file.duplicate && aiData.pHash) {
      const existing2 = await File.findOne({ pHash: aiData.pHash, _id: { $ne: file._id } });
      if (existing2) {
        file.duplicate = true;
        file.duplicateOf = existing2._id;
      }
    }

    await file.save();
    res.json({ message: 'Processed', aiData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
