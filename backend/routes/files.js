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
      const fullPath = existingByHash.path === '/' ? `/${existingByHash.filename}` : `${existingByHash.path}/${existingByHash.filename}`;
      return res.json({
        isDuplicate: true,
        duplicateOf: {
          id: existingByHash._id,
          filename: existingByHash.filename,
          path: existingByHash.path,
          fullPath: fullPath,
          createdAt: existingByHash.createdAt
        },
        message: `"${originalname}" is a duplicate of "${existingByHash.filename}" located at: ${fullPath}`
      });
    }

    // Check for existing file with same filename for this user
    const existingByName = await File.findOne({ filename: originalname, userId });
    if (existingByName) {
      const fullPath = existingByName.path === '/' ? `/${existingByName.filename}` : `${existingByName.path}/${existingByName.filename}`;
      return res.json({
        isDuplicate: true,
        duplicateOf: {
          id: existingByName._id,
          filename: existingByName.filename,
          path: existingByName.path,
          fullPath: fullPath,
          createdAt: existingByName.createdAt
        },
        message: `"${originalname}" already exists at: ${fullPath}`
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
    const path = req.body.path || '/'; // Get path from request body, default to root
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
      hash,
      path: path
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

// Create a folder
router.post('/folders', auth, async (req, res) => {
  try {
    const { folderName, path = '/' } = req.body;
    
    if (!folderName) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    // Validate folder name (no special characters except spaces, hyphens, underscores)
    if (!/^[a-zA-Z0-9 _-]+$/.test(folderName)) {
      return res.status(400).json({ error: 'Invalid folder name. Use only letters, numbers, spaces, hyphens, and underscores.' });
    }

    // Check if folder already exists at this path
    const existingFolder = await File.findOne({
      userId: req.user.id,
      filename: folderName,
      path: path,
      isFolder: true
    });

    if (existingFolder) {
      return res.status(400).json({ error: 'A folder with this name already exists in this location' });
    }

    // Create folder record (no MinIO object needed)
    const folderRecord = new File({
      userId: req.user.id,
      filename: folderName,
      path: path,
      isFolder: true,
      minioKey: `${req.user.id}/${path}/${folderName}/` // Virtual key for consistency
    });

    await folderRecord.save();
    res.json({ message: 'Folder created', folder: folderRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Move file to a folder
router.put('/:id/move', auth, async (req, res) => {
  try {
    const { targetPath } = req.body; // e.g., '/', '/Documents', '/Photos/2024'
    
    if (targetPath === undefined) {
      return res.status(400).json({ error: 'targetPath is required' });
    }

    const fileRecord = await File.findById(req.params.id);
    if (!fileRecord) return res.status(404).json({ message: 'Not found' });
    if (fileRecord.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    // Validate that target path exists if not root
    if (targetPath !== '/') {
      const pathParts = targetPath.split('/').filter(p => p);
      let currentPath = '/';
      
      for (const part of pathParts) {
        const folderExists = await File.findOne({
          userId: req.user.id,
          filename: part,
          path: currentPath,
          isFolder: true
        });
        
        if (!folderExists) {
          return res.status(400).json({ error: `Folder path does not exist: ${currentPath}${part}` });
        }
        
        currentPath = currentPath === '/' ? `/${part}` : `${currentPath}/${part}`;
      }
    }

    // Update file's path
    fileRecord.path = targetPath;
    await fileRecord.save();

    res.json({ message: 'File moved successfully', file: fileRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Rename file or folder
router.put('/:id/rename', auth, async (req, res) => {
  try {
    const { newName } = req.body;
    
    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: 'New name is required' });
    }

    const fileRecord = await File.findById(req.params.id);
    if (!fileRecord) return res.status(404).json({ message: 'Not found' });
    if (fileRecord.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    // Validate new name
    if (fileRecord.isFolder) {
      // For folders: no special characters except spaces, hyphens, underscores
      if (!/^[a-zA-Z0-9 _-]+$/.test(newName.trim())) {
        return res.status(400).json({ error: 'Invalid folder name. Use only letters, numbers, spaces, hyphens, and underscores.' });
      }
    } else {
      // For files: allow most characters but not path separators
      if (/[/\\]/.test(newName)) {
        return res.status(400).json({ error: 'File name cannot contain / or \\' });
      }
    }

    // Check if a file/folder with the new name already exists in the same path
    const existingFile = await File.findOne({
      userId: req.user.id,
      filename: newName.trim(),
      path: fileRecord.path,
      _id: { $ne: fileRecord._id }
    });

    if (existingFile) {
      return res.status(400).json({ error: `A ${fileRecord.isFolder ? 'folder' : 'file'} with this name already exists in this location` });
    }

    // Update filename
    fileRecord.filename = newName.trim();
    await fileRecord.save();

    res.json({ message: `${fileRecord.isFolder ? 'Folder' : 'File'} renamed successfully`, file: fileRecord });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
