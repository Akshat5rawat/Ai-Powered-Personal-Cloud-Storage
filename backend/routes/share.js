const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const auth = require('../middleware/auth');
const ShareLink = require('../models/ShareLink');
const File = require('../models/File');
const storageService = require('../services/supabaseService');

const router = express.Router();

// Generate a unique share token
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Create a share link for a file
router.post('/create', auth, async (req, res) => {
  try {
    const { fileId, permissions, expiresIn, password, maxAccess } = req.body;
    const userId = req.user.id;

    // Verify file exists and belongs to user
    const file = await File.findOne({ _id: fileId, userId });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Calculate expiry date
    let expiresAt;
    switch (expiresIn) {
      case '1h':
        expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        break;
      case '24h':
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        break;
      case '7d':
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 'never':
        expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years
        break;
      default:
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Default 24h
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Create share link
    const shareLink = new ShareLink({
      fileId,
      userId,
      token: generateToken(),
      permissions: {
        view: permissions?.view ?? true,
        download: permissions?.download ?? false,
        edit: permissions?.edit ?? false
      },
      expiresAt,
      password: hashedPassword,
      maxAccess: maxAccess || null
    });

    await shareLink.save();

    res.json({
      success: true,
      shareLink: {
        id: shareLink._id,
        token: shareLink.token,
        url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/share/${shareLink.token}`,
        permissions: shareLink.permissions,
        expiresAt: shareLink.expiresAt,
        hasPassword: !!password
      }
    });
  } catch (err) {
    console.error('Create share link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all share links for a file
router.get('/file/:fileId', auth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.id;

    // Verify file belongs to user
    const file = await File.findOne({ _id: fileId, userId });
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const shareLinks = await ShareLink.find({ fileId, userId, isActive: true });

    res.json({
      shareLinks: shareLinks.map(link => ({
        id: link._id,
        token: link.token,
        url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/share/${link.token}`,
        permissions: link.permissions,
        expiresAt: link.expiresAt,
        hasPassword: !!link.password,
        accessCount: link.accessCount,
        maxAccess: link.maxAccess,
        createdAt: link.createdAt
      }))
    });
  } catch (err) {
    console.error('Get share links error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all share links created by user
router.get('/my-shares', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const shareLinks = await ShareLink.find({ userId, isActive: true })
      .populate('fileId', 'filename mimetype size')
      .sort({ createdAt: -1 });

    res.json({
      shareLinks: shareLinks.map(link => ({
        id: link._id,
        token: link.token,
        url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/share/${link.token}`,
        file: link.fileId ? {
          id: link.fileId._id,
          filename: link.fileId.filename,
          mimetype: link.fileId.mimetype,
          size: link.fileId.size
        } : null,
        permissions: link.permissions,
        expiresAt: link.expiresAt,
        hasPassword: !!link.password,
        accessCount: link.accessCount,
        maxAccess: link.maxAccess,
        createdAt: link.createdAt
      }))
    });
  } catch (err) {
    console.error('Get my shares error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get share stats for analytics
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Count active share links
    const totalShareLinks = await ShareLink.countDocuments({ userId, isActive: true });
    
    // Count files with at least one active share link
    const filesWithShares = await ShareLink.distinct('fileId', { userId, isActive: true });
    const totalSharedFiles = filesWithShares.length;
    
    // Total access count across all shares
    const accessStats = await ShareLink.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId), isActive: true } },
      { $group: { _id: null, totalAccess: { $sum: '$accessCount' } } }
    ]);
    const totalAccessCount = accessStats[0]?.totalAccess || 0;

    res.json({
      totalShareLinks,
      totalSharedFiles,
      totalAccessCount
    });
  } catch (err) {
    console.error('Get share stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete/revoke a share link
router.delete('/:shareId', auth, async (req, res) => {
  try {
    const { shareId } = req.params;
    const userId = req.user.id;

    const shareLink = await ShareLink.findOne({ _id: shareId, userId });
    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    shareLink.isActive = false;
    await shareLink.save();

    res.json({ success: true, message: 'Share link revoked' });
  } catch (err) {
    console.error('Delete share link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update share link permissions
router.put('/:shareId', auth, async (req, res) => {
  try {
    const { shareId } = req.params;
    const { permissions, expiresIn, maxAccess } = req.body;
    const userId = req.user.id;

    const shareLink = await ShareLink.findOne({ _id: shareId, userId, isActive: true });
    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    if (permissions) {
      shareLink.permissions = {
        view: permissions.view ?? shareLink.permissions.view,
        download: permissions.download ?? shareLink.permissions.download,
        edit: permissions.edit ?? shareLink.permissions.edit
      };
    }

    if (expiresIn) {
      switch (expiresIn) {
        case '1h':
          shareLink.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
          break;
        case '24h':
          shareLink.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          break;
        case '7d':
          shareLink.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          shareLink.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    if (maxAccess !== undefined) {
      shareLink.maxAccess = maxAccess;
    }

    await shareLink.save();

    res.json({
      success: true,
      shareLink: {
        id: shareLink._id,
        token: shareLink.token,
        permissions: shareLink.permissions,
        expiresAt: shareLink.expiresAt,
        maxAccess: shareLink.maxAccess
      }
    });
  } catch (err) {
    console.error('Update share link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ PUBLIC ENDPOINTS (No auth required) ============

// Verify share link and get file info (public)
router.post('/access/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const shareLink = await ShareLink.findOne({ token, isActive: true })
      .populate('fileId', 'filename mimetype size category');

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found or expired' });
    }

    // Check if expired
    if (new Date() > shareLink.expiresAt) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    // Check max access limit
    if (shareLink.maxAccess && shareLink.accessCount >= shareLink.maxAccess) {
      return res.status(410).json({ error: 'Share link access limit reached' });
    }

    // Check password if required
    if (shareLink.password) {
      if (!password) {
        return res.status(401).json({ error: 'Password required', requiresPassword: true });
      }
      const isValid = await bcrypt.compare(password, shareLink.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    // Increment access count
    shareLink.accessCount += 1;
    await shareLink.save();

    res.json({
      success: true,
      file: {
        id: shareLink.fileId._id,
        filename: shareLink.fileId.filename,
        mimetype: shareLink.fileId.mimetype,
        size: shareLink.fileId.size,
        category: shareLink.fileId.category
      },
      permissions: shareLink.permissions,
      expiresAt: shareLink.expiresAt
    });
  } catch (err) {
    console.error('Access share link error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Download file via share link (public)
router.post('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const shareLink = await ShareLink.findOne({ token, isActive: true })
      .populate('fileId');

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Check if expired
    if (new Date() > shareLink.expiresAt) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    // Check download permission
    if (!shareLink.permissions.download) {
      return res.status(403).json({ error: 'Download not permitted' });
    }

    // Check password if required
    if (shareLink.password) {
      if (!password) {
        return res.status(401).json({ error: 'Password required' });
      }
      const isValid = await bcrypt.compare(password, shareLink.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    const file = shareLink.fileId;
    const buffer = await storageService.downloadFile(file.minioKey);

    res.set({
      'Content-Type': file.mimetype || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
      'Content-Length': buffer.length
    });

    res.send(buffer);
  } catch (err) {
    console.error('Download shared file error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get file preview via share link (public)
router.post('/preview/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const shareLink = await ShareLink.findOne({ token, isActive: true })
      .populate('fileId');

    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Check if expired
    if (new Date() > shareLink.expiresAt) {
      return res.status(410).json({ error: 'Share link has expired' });
    }

    // Check view permission
    if (!shareLink.permissions.view) {
      return res.status(403).json({ error: 'View not permitted' });
    }

    // Check password if required
    if (shareLink.password) {
      if (!password) {
        return res.status(401).json({ error: 'Password required' });
      }
      const isValid = await bcrypt.compare(password, shareLink.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    const file = shareLink.fileId;
    const buffer = await storageService.downloadFile(file.minioKey);

    res.set({
      'Content-Type': file.mimetype || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.filename)}"`
    });

    res.send(buffer);
  } catch (err) {
    console.error('Preview shared file error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
