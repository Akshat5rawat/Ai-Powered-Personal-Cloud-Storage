const express = require('express');
const auth = require('../middleware/auth');
const aiService = require('../services/aiService');
const File = require('../models/File');
const summaryQueue = require('../services/summaryQueueService');

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

// ==================== SUMMARY ROUTES ====================

/**
 * POST /ai/summarize/:id - Generate AI summary for a file
 * Returns the generated summary or existing summary if already processed
 */
router.post('/summarize/:id', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    if (file.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    // Check if summary already exists
    if (file.summary && file.summaryStatus === 'completed') {
      return res.json({
        status: 'already_summarized',
        fileId: file._id.toString(),
        summary: file.summary,
        generatedAt: file.summaryGeneratedAt
      });
    }

    // Check if file type is summarizable
    if (!aiService.isSummarizable(file.mimetype)) {
      file.summaryStatus = 'unsupported';
      file.summaryError = `File type ${file.mimetype} is not supported for summarization`;
      await file.save();
      return res.status(400).json({
        status: 'unsupported',
        fileId: file._id.toString(),
        message: file.summaryError
      });
    }

    // Generate summary via AI service
    const result = await aiService.summarizeFile(
      file._id.toString(),
      file.minioKey,
      file.mimetype
    );

    // Update file with summary data (already updated by AI service, but sync here)
    if (result.status === 'completed') {
      file.summary = result.summary;
      file.summaryGeneratedAt = new Date(result.generatedAt);
      file.summaryStatus = 'completed';
      file.summaryError = null;
      await file.save();
    }

    res.json(result);
  } catch (err) {
    console.error('Summarization error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /ai/summary/:id - Get existing summary for a file
 */
router.get('/summary/:id', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    if (file.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    res.json({
      fileId: file._id.toString(),
      filename: file.filename,
      mimetype: file.mimetype,
      summary: file.summary,
      summaryStatus: file.summaryStatus,
      summaryGeneratedAt: file.summaryGeneratedAt,
      summaryError: file.summaryError,
      isSummarizable: aiService.isSummarizable(file.mimetype)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /ai/summarizable/:id - Check if a file can be summarized
 */
router.get('/summarizable/:id', auth, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    if (file.userId.toString() !== req.user.id) return res.status(403).json({ message: 'Forbidden' });

    res.json({
      fileId: file._id.toString(),
      mimetype: file.mimetype,
      isSummarizable: aiService.isSummarizable(file.mimetype),
      hasSummary: !!file.summary,
      summaryStatus: file.summaryStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== BACKFILL ENDPOINTS ====================

/**
 * POST /ai/summary/backfill
 * 
 * Trigger backfill for files without summaries.
 * Queues files in batches for background processing.
 */
router.post('/summary/backfill', auth, async (req, res) => {
  try {
    const { batchSize = 10, userOnly = true } = req.body;
    const userId = req.user.id;

    // Build query for files needing summaries
    const query = {
      $or: [
        { summary: null, summaryStatus: { $nin: ['pending', 'processing', 'unsupported'] } },
        { summary: { $exists: false }, summaryStatus: { $nin: ['pending', 'processing', 'unsupported'] } },
        { summaryStatus: 'failed' }
      ]
    };

    // Filter by user if requested
    if (userOnly) {
      query.userId = userId;
    }

    // Find files needing summaries
    const files = await File.find(query)
      .select('_id filename mimetype minioKey')
      .limit(Math.min(batchSize, 50)); // Cap at 50 to prevent overload

    // Filter to only summarizable types
    const summarizableFiles = files.filter(f => aiService.isSummarizable(f.mimetype));

    if (summarizableFiles.length === 0) {
      return res.json({
        message: 'No files need summarization',
        queued: 0
      });
    }

    // Mark as pending and enqueue
    let queued = 0;
    for (const file of summarizableFiles) {
      await File.updateOne(
        { _id: file._id },
        { $set: { summaryStatus: 'pending' } }
      );

      const added = summaryQueue.enqueue(
        file._id.toString(),
        file.minioKey,
        file.mimetype,
        10 // Lower priority for backfill vs user-requested
      );

      if (added) queued++;
    }

    // Get total remaining
    const totalRemaining = await File.countDocuments({
      ...query,
      userId: userOnly ? userId : { $exists: true }
    }) - summarizableFiles.length;

    res.json({
      message: `Backfill started`,
      queued,
      filesFound: summarizableFiles.length,
      remainingFiles: Math.max(0, totalRemaining),
      queueStatus: summaryQueue.getStatus()
    });

  } catch (err) {
    console.error('Backfill error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /ai/summary/stats
 * 
 * Get summary statistics for the current user
 */
router.get('/summary/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await File.aggregate([
      { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$summaryStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsMap = {
      completed: 0,
      pending: 0,
      processing: 0,
      failed: 0,
      unsupported: 0,
      noStatus: 0
    };

    stats.forEach(s => {
      if (s._id === null || s._id === undefined) {
        statsMap.noStatus = s.count;
      } else {
        statsMap[s._id] = s.count;
      }
    });

    // Calculate totals
    const totalFiles = Object.values(statsMap).reduce((a, b) => a + b, 0);
    const needsSummary = statsMap.noStatus + statsMap.failed;

    res.json({
      userId,
      totalFiles,
      summaryStats: statsMap,
      needsSummary,
      queueStatus: summaryQueue.getStatus()
    });

  } catch (err) {
    console.error('Summary stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
