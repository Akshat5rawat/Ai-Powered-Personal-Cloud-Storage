/**
 * Summary Queue Service
 * ---------------------
 * In-memory queue for background summarization processing.
 * Ensures summaries are generated asynchronously without blocking requests.
 */

const File = require('../models/File');
const aiService = require('./aiService');

// Queue configuration
const MAX_CONCURRENT = 4; // Max concurrent summarization jobs (increased for faster processing)
const RETRY_DELAY = 3000; // 3 seconds before retry on failure
const MAX_RETRIES = 2;

// In-memory queue
const queue = [];
const processing = new Set();
let isProcessing = false;

/**
 * Add a file to the summarization queue
 * @param {string} fileId - MongoDB file ID
 * @param {string} minioKey - Storage key
 * @param {string} mimetype - File MIME type
 * @param {number} priority - Priority level (lower = higher priority)
 * @returns {boolean} Whether the file was added to queue
 */
function enqueue(fileId, minioKey, mimetype, priority = 10) {
  // Check if already in queue or processing
  if (processing.has(fileId)) {
    console.log(`[SummaryQueue] File ${fileId} already processing`);
    return false;
  }

  const existingIndex = queue.findIndex(item => item.fileId === fileId);
  if (existingIndex !== -1) {
    console.log(`[SummaryQueue] File ${fileId} already in queue`);
    return false;
  }

  // Add to queue
  queue.push({
    fileId,
    minioKey,
    mimetype,
    priority,
    retries: 0,
    addedAt: Date.now()
  });

  // Sort by priority (lower = higher priority)
  queue.sort((a, b) => a.priority - b.priority);

  console.log(`[SummaryQueue] Enqueued file ${fileId} (queue size: ${queue.length})`);

  // Start processing if not already running
  if (!isProcessing) {
    processQueue();
  }

  return true;
}

/**
 * Process the queue
 */
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  console.log('[SummaryQueue] Starting queue processing...');

  while (queue.length > 0 || processing.size > 0) {
    // Fill up to MAX_CONCURRENT workers
    while (queue.length > 0 && processing.size < MAX_CONCURRENT) {
      const item = queue.shift();
      if (item) {
        processing.add(item.fileId);
        processItem(item); // Don't await - run in parallel
      }
    }

    // Wait a bit before checking again
    await sleep(1000);
  }

  isProcessing = false;
  console.log('[SummaryQueue] Queue processing complete');
}

/**
 * Process a single queue item
 */
async function processItem(item) {
  const { fileId, minioKey, mimetype, retries } = item;

  console.log(`[SummaryQueue] Processing file ${fileId} (attempt ${retries + 1})`);

  try {
    // Mark as processing in DB
    await File.updateOne(
      { _id: fileId },
      { $set: { summaryStatus: 'processing' } }
    );

    // Call AI service
    const result = await aiService.summarizeFile(fileId, minioKey, mimetype);

    if (result.status === 'completed' || result.status === 'already_summarized') {
      console.log(`[SummaryQueue] ✓ Completed: ${fileId}`);
    } else if (result.status === 'unsupported') {
      console.log(`[SummaryQueue] ○ Unsupported: ${fileId}`);
    } else {
      throw new Error(`Unexpected status: ${result.status}`);
    }

  } catch (error) {
    console.error(`[SummaryQueue] ✗ Failed: ${fileId} - ${error.message}`);

    // Retry logic
    if (retries < MAX_RETRIES) {
      console.log(`[SummaryQueue] Will retry ${fileId} in ${RETRY_DELAY / 1000}s`);
      
      // Re-add to queue with incremented retry count
      setTimeout(() => {
        queue.push({
          ...item,
          retries: retries + 1,
          priority: item.priority + 1 // Lower priority for retries
        });
        queue.sort((a, b) => a.priority - b.priority);
      }, RETRY_DELAY);
    } else {
      console.error(`[SummaryQueue] Max retries reached for ${fileId}`);
      
      // Mark as failed in DB
      await File.updateOne(
        { _id: fileId },
        { 
          $set: { 
            summaryStatus: 'failed',
            summaryError: `Max retries exceeded: ${error.message}`
          }
        }
      );
    }
  } finally {
    processing.delete(fileId);
  }
}

/**
 * Get queue status
 */
function getStatus() {
  return {
    queueLength: queue.length,
    processing: Array.from(processing),
    processingCount: processing.size,
    isActive: isProcessing
  };
}

/**
 * Clear the queue (for testing/maintenance)
 */
function clearQueue() {
  queue.length = 0;
  console.log('[SummaryQueue] Queue cleared');
}

/**
 * Check if a file is queued or processing
 */
function isQueued(fileId) {
  return processing.has(fileId) || queue.some(item => item.fileId === fileId);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  enqueue,
  getStatus,
  clearQueue,
  isQueued,
  processQueue
};
