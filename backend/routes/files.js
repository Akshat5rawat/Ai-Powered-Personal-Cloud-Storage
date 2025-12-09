const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const auth = require('../middleware/auth');
const File = require('../models/File');
const storageService = require('../services/supabaseService');
const axios = require('axios');
const aiService = require('../services/aiService');
const { sha256 } = require('../utils/crypto');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Upload a file
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    const originalname = req.file.originalname;
    const mimetype = req.file.mimetype;
    const size = req.file.size;
    const userId = req.user.id;
    const key = `${userId}/${Date.now()}_${originalname}`;

    // compute SHA256 hash in backend (fallback)
    const hash = sha256(buffer);

    // upload to Supabase Storage
    await storageService.uploadBuffer(buffer, key, size, { 'Content-Type': mimetype });

    // create file record
    const fileRecord = new File({
      userId,
      filename: originalname,
      size,
      mimetype,
      minioKey: key,
      hash
    });
    await fileRecord.save();

    // send to AI microservice via service
    try {
      const aiData = await aiService.processFile(fileRecord._id.toString(), key, mimetype);
      if (aiData.category) fileRecord.category = aiData.category;
      if (aiData.embedding) fileRecord.embedding = aiData.embedding;
      if (aiData.hash) fileRecord.hash = aiData.hash;
      if (aiData.pHash) fileRecord.pHash = aiData.pHash;

      // duplicate detection: check sha and pHash
      if (aiData.hash) {
        const existing = await File.findOne({ hash: aiData.hash, _id: { $ne: fileRecord._id } });
        if (existing) {
          fileRecord.duplicate = true;
          fileRecord.duplicateOf = existing._id;
        }
      }

      // For performance: if duplicate found via sha, skip pHash
      if (!fileRecord.duplicate && aiData.pHash) {
        const existing2 = await File.findOne({ pHash: aiData.pHash, _id: { $ne: fileRecord._id } });
        if (existing2) {
          fileRecord.duplicate = true;
          fileRecord.duplicateOf = existing2._id;
        }
      }

      await fileRecord.save();
    } catch (err) {
      console.error('AI service error', err.message);
    }

    res.json({ message: 'Uploaded', fileId: fileRecord._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get files
router.get('/', auth, async (req, res) => {
  try {
    const files = await File.find({ userId: req.user.id });
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download via presigned URL
router.get('/download/:id', auth, async (req, res) => {
  try {
    const fileRecord = await File.findById(req.params.id);
    if (!fileRecord) return res.status(404).json({ message: 'Not found' });
    if (fileRecord.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });
    const url = await storageService.presignedUrl(fileRecord.minioKey);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete file
router.delete('/:id', auth, async (req, res) => {
  try {
    const fileRecord = await File.findById(req.params.id);
    if (!fileRecord) return res.status(404).json({ message: 'Not found' });
    if (fileRecord.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    // If other files are marked as duplicates of this file, clear their duplicate status
    await File.updateMany(
      { duplicateOf: fileRecord._id },
      { $set: { duplicate: false, duplicateOf: null } }
    );

    // If this file is a duplicate of another, check if we need to update the original
    if (fileRecord.duplicateOf) {
      // Find remaining duplicates of the same original file
      const remainingDuplicates = await File.countDocuments({
        duplicateOf: fileRecord.duplicateOf,
        _id: { $ne: fileRecord._id }
      });
      
      // If no more duplicates exist, clear the original file's duplicate status
      if (remainingDuplicates === 0) {
        await File.updateOne(
          { _id: fileRecord.duplicateOf },
          { $set: { duplicate: false, duplicateOf: null } }
        );
      }
    }

    await storageService.removeObject(fileRecord.minioKey);
    await File.deleteOne({ _id: fileRecord._id });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
