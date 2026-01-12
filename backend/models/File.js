const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  size: { type: Number },
  mimetype: { type: String },
  minioKey: { type: String, required: true },
  category: { type: String },
  embedding: { type: [Number], default: [] },
  hash: { type: String },
  pHash: { type: String },
  duplicate: { type: Boolean, default: false },
  duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'File', default: null },
  // AI Summary fields
  summary: { type: String, default: null },
  summaryGeneratedAt: { type: Date, default: null },
  summaryStatus: { 
    type: String, 
    enum: [null, 'pending', 'processing', 'completed', 'failed', 'unsupported'],
    default: null 
  },
  summaryError: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Text index for keyword search (filename, category)
FileSchema.index({ filename: 'text', category: 'text' });

module.exports = mongoose.model('File', FileSchema);
