/**
 * Summary Backfill Job
 * --------------------
 * Batch processes existing files that don't have summaries.
 * Can be run once after deployment or scheduled periodically.
 * 
 * Usage:
 *   node jobs/summaryBackfill.js              # Run once
 *   node jobs/summaryBackfill.js --batch=10   # Custom batch size
 *   node jobs/summaryBackfill.js --continuous # Keep running until all done
 */

require('dotenv').config();
const mongoose = require('mongoose');
const File = require('../models/File');
const aiService = require('../services/aiService');

// Configuration
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '5', 10);
const CONTINUOUS = process.argv.includes('--continuous');
const DELAY_BETWEEN_FILES = 2000; // 2 seconds between files to avoid overloading AI service
const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds between batches

// Summarizable mimetypes
const SUMMARIZABLE_TYPES = [
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

function isSummarizable(mimetype) {
  if (!mimetype) return false;
  return SUMMARIZABLE_TYPES.some(type => mimetype.toLowerCase().includes(type));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find files that need summarization
 */
async function findFilesNeedingSummary(limit) {
  // Find files where:
  // - summary is null/missing AND summaryStatus is not 'pending' or 'processing'
  // - OR summaryStatus is 'failed' (retry failed ones)
  const files = await File.find({
    $or: [
      { summary: null, summaryStatus: { $nin: ['pending', 'processing', 'unsupported'] } },
      { summary: { $exists: false }, summaryStatus: { $nin: ['pending', 'processing', 'unsupported'] } },
      { summaryStatus: 'failed' } // Retry failed summaries
    ]
  })
    .select('_id filename mimetype minioKey summaryStatus')
    .limit(limit);

  // Filter to only summarizable file types
  return files.filter(f => isSummarizable(f.mimetype));
}

/**
 * Process a single file for summarization
 */
async function processFile(file) {
  const fileId = file._id.toString();
  console.log(`  Processing: ${file.filename} (${file.mimetype})`);

  try {
    // Mark as pending to prevent duplicate processing
    await File.updateOne(
      { _id: file._id },
      { $set: { summaryStatus: 'pending' } }
    );

    // Call AI service to generate summary
    const result = await aiService.summarizeFile(fileId, file.minioKey, file.mimetype);

    if (result.status === 'completed') {
      console.log(`  ✓ Completed: ${file.filename}`);
      return { success: true, fileId, filename: file.filename };
    } else if (result.status === 'already_summarized') {
      console.log(`  ○ Already done: ${file.filename}`);
      return { success: true, fileId, filename: file.filename, skipped: true };
    } else if (result.status === 'unsupported') {
      console.log(`  ○ Unsupported: ${file.filename}`);
      return { success: true, fileId, filename: file.filename, unsupported: true };
    } else {
      console.log(`  ? Unknown status: ${result.status}`);
      return { success: false, fileId, filename: file.filename, error: 'Unknown status' };
    }
  } catch (error) {
    console.error(`  ✗ Failed: ${file.filename} - ${error.message}`);
    
    // Mark as failed in database
    await File.updateOne(
      { _id: file._id },
      { 
        $set: { 
          summaryStatus: 'failed', 
          summaryError: error.message 
        } 
      }
    );

    return { success: false, fileId, filename: file.filename, error: error.message };
  }
}

/**
 * Process a batch of files
 */
async function processBatch() {
  const files = await findFilesNeedingSummary(BATCH_SIZE);

  if (files.length === 0) {
    return { processed: 0, remaining: 0 };
  }

  console.log(`\nProcessing batch of ${files.length} files...`);

  const results = {
    success: 0,
    failed: 0,
    skipped: 0
  };

  for (const file of files) {
    const result = await processFile(file);
    
    if (result.success) {
      if (result.skipped || result.unsupported) {
        results.skipped++;
      } else {
        results.success++;
      }
    } else {
      results.failed++;
    }

    // Delay between files to avoid overloading AI service
    if (files.indexOf(file) < files.length - 1) {
      await sleep(DELAY_BETWEEN_FILES);
    }
  }

  // Check remaining files
  const remaining = await File.countDocuments({
    $or: [
      { summary: null, summaryStatus: { $nin: ['pending', 'processing', 'unsupported', 'completed'] } },
      { summary: { $exists: false }, summaryStatus: { $nin: ['pending', 'processing', 'unsupported', 'completed'] } }
    ]
  });

  return {
    processed: files.length,
    success: results.success,
    failed: results.failed,
    skipped: results.skipped,
    remaining
  };
}

/**
 * Get summary statistics
 */
async function getStats() {
  const total = await File.countDocuments({});
  const withSummary = await File.countDocuments({ summaryStatus: 'completed' });
  const pending = await File.countDocuments({ summaryStatus: 'pending' });
  const processing = await File.countDocuments({ summaryStatus: 'processing' });
  const failed = await File.countDocuments({ summaryStatus: 'failed' });
  const unsupported = await File.countDocuments({ summaryStatus: 'unsupported' });
  const noStatus = await File.countDocuments({ 
    summaryStatus: { $in: [null, undefined] },
    summary: null 
  });

  return { total, withSummary, pending, processing, failed, unsupported, noStatus };
}

/**
 * Main backfill function
 */
async function runBackfill() {
  console.log('='.repeat(50));
  console.log('Summary Backfill Job');
  console.log('='.repeat(50));
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`Continuous Mode: ${CONTINUOUS}`);
  console.log('');

  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  // Show initial stats
  const initialStats = await getStats();
  console.log('\nInitial Statistics:');
  console.log(`  Total files: ${initialStats.total}`);
  console.log(`  With summary: ${initialStats.withSummary}`);
  console.log(`  Pending: ${initialStats.pending}`);
  console.log(`  Processing: ${initialStats.processing}`);
  console.log(`  Failed: ${initialStats.failed}`);
  console.log(`  Unsupported: ${initialStats.unsupported}`);
  console.log(`  No status: ${initialStats.noStatus}`);

  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  do {
    const result = await processBatch();
    
    totalProcessed += result.processed;
    totalSuccess += result.success;
    totalFailed += result.failed;

    if (result.processed === 0) {
      console.log('\nNo more files to process.');
      break;
    }

    console.log(`\nBatch complete: ${result.success} succeeded, ${result.failed} failed, ${result.skipped} skipped`);
    console.log(`Remaining files needing summary: ${result.remaining}`);

    if (CONTINUOUS && result.remaining > 0) {
      console.log(`\nWaiting ${DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }

  } while (CONTINUOUS);

  // Show final stats
  const finalStats = await getStats();
  console.log('\n' + '='.repeat(50));
  console.log('Backfill Complete');
  console.log('='.repeat(50));
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Successful: ${totalSuccess}`);
  console.log(`Failed: ${totalFailed}`);
  console.log('\nFinal Statistics:');
  console.log(`  Total files: ${finalStats.total}`);
  console.log(`  With summary: ${finalStats.withSummary}`);
  console.log(`  Pending: ${finalStats.pending}`);
  console.log(`  Failed: ${finalStats.failed}`);
  console.log(`  Unsupported: ${finalStats.unsupported}`);

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB');
}

// Run if called directly
if (require.main === module) {
  runBackfill()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Backfill job failed:', err);
      process.exit(1);
    });
}

module.exports = { runBackfill, processBatch, findFilesNeedingSummary, getStats };
