const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const auth = require('../middleware/auth');
const File = require('../models/File');
const ShareLink = require('../models/ShareLink');
const storageService = require('../services/supabaseService');
const axios = require('axios');
const aiService = require('../services/aiService');
const { sha256 } = require('../utils/crypto');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Check for duplicates before upload (pre-upload check)
router.post('/check-duplicate', auth, upload.single('file'), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    const originalname = req.file.originalname;
    const userId = req.user.id;

    // compute SHA256 hash
    const hash = sha256(buffer);

    // Check for existing file with same hash for this user
    const existingByHash = await File.findOne({ hash, userId });
    if (existingByHash) {
      return res.json({
        isDuplicate: true,
        duplicateOf: {
          id: existingByHash._id,
          filename: existingByHash.filename,
          createdAt: existingByHash.createdAt
        },
        message: `"${originalname}" is a duplicate of "${existingByHash.filename}"`
      });
    }

    // Check for existing file with same filename for this user
    const existingByName = await File.findOne({ filename: originalname, userId });
    if (existingByName) {
      return res.json({
        isDuplicate: true,
        duplicateOf: {
          id: existingByName._id,
          filename: existingByName.filename,
          createdAt: existingByName.createdAt
        },
        message: `"${originalname}" already exists with the same name`
      });
    }

    res.json({ isDuplicate: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

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
    
    // Get share links count for each file
    const fileIds = files.map(f => f._id);
    const shareLinksAgg = await ShareLink.aggregate([
      { $match: { fileId: { $in: fileIds }, isActive: true } },
      { $group: { _id: '$fileId', count: { $sum: 1 } } }
    ]);
    
    // Create a map of fileId -> shareLinks count
    const shareLinksMap = {};
    shareLinksAgg.forEach(item => {
      shareLinksMap[item._id.toString()] = item.count;
    });
    
    // Add shareLinks array (with count) to each file
    const filesWithShareInfo = files.map(f => {
      const fileObj = f.toObject();
      const count = shareLinksMap[f._id.toString()] || 0;
      fileObj.shareLinks = count > 0 ? new Array(count).fill({}) : [];
      return fileObj;
    });
    
    res.json(filesWithShareInfo);
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

// Get storage insights (duplicates, space saved, similar files)
router.get('/storage-insights', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all files for this user
    const files = await File.find({ userId });
    
    // Find duplicate files (files that have the same hash)
    const hashGroups = {};
    files.forEach(file => {
      if (file.hash) {
        if (!hashGroups[file.hash]) {
          hashGroups[file.hash] = [];
        }
        hashGroups[file.hash].push(file);
      }
    });
    
    // Calculate duplicates and space that could be saved
    let duplicateCount = 0;
    let potentialSpaceSaved = 0;
    const duplicateGroups = [];
    
    Object.entries(hashGroups).forEach(([hash, groupFiles]) => {
      if (groupFiles.length > 1) {
        // All files except the first are duplicates
        const duplicates = groupFiles.slice(1);
        duplicateCount += duplicates.length;
        
        // Space saved = size of duplicate files
        const spaceSaved = duplicates.reduce((sum, f) => sum + (f.size || 0), 0);
        potentialSpaceSaved += spaceSaved;
        
        duplicateGroups.push({
          original: {
            id: groupFiles[0]._id,
            filename: groupFiles[0].filename,
            size: groupFiles[0].size,
            createdAt: groupFiles[0].createdAt
          },
          duplicates: duplicates.map(f => ({
            id: f._id,
            filename: f.filename,
            size: f.size,
            createdAt: f.createdAt
          })),
          spaceSaved
        });
      }
    });
    
    // Get files marked as duplicates in DB
    const markedDuplicates = await File.find({ userId, duplicate: true }).populate('duplicateOf', 'filename');
    
    // Calculate total storage used
    const totalStorage = files.reduce((sum, f) => sum + (f.size || 0), 0);
    
    // Find similar files by name (files with similar names)
    const similarByName = [];
    const processedPairs = new Set();
    
    files.forEach((file1, i) => {
      files.forEach((file2, j) => {
        if (i >= j) return; // Avoid duplicate pairs
        
        const pairKey = [file1._id.toString(), file2._id.toString()].sort().join('-');
        if (processedPairs.has(pairKey)) return;
        
        const name1 = file1.filename.toLowerCase().replace(/\.[^/.]+$/, ''); // Remove extension
        const name2 = file2.filename.toLowerCase().replace(/\.[^/.]+$/, '');
        
        // Check if names are similar (one contains the other, or start similarly)
        if (name1.length > 3 && name2.length > 3) {
          if (name1.includes(name2) || name2.includes(name1) || 
              (name1.substring(0, 5) === name2.substring(0, 5) && file1.hash !== file2.hash)) {
            similarByName.push({
              file1: { id: file1._id, filename: file1.filename, size: file1.size },
              file2: { id: file2._id, filename: file2.filename, size: file2.size },
              reason: 'Similar filename'
            });
            processedPairs.add(pairKey);
          }
        }
      });
    });
    
    res.json({
      totalFiles: files.length,
      totalStorage,
      duplicateCount,
      potentialSpaceSaved,
      duplicateGroups: duplicateGroups.slice(0, 10), // Limit to 10 groups
      similarFiles: similarByName.slice(0, 10), // Limit to 10 pairs
      markedDuplicates: markedDuplicates.length
    });
  } catch (err) {
    console.error('Storage insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
