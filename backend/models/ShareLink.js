const mongoose = require('mongoose');

const ShareLinkSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  permissions: {
    view: { type: Boolean, default: true },
    download: { type: Boolean, default: false },
    edit: { type: Boolean, default: false }
  },
  expiresAt: { type: Date, required: true },
  password: { type: String, default: null }, // Optional password protection
  accessCount: { type: Number, default: 0 },
  maxAccess: { type: Number, default: null }, // Optional max access limit
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Index for quick token lookups
ShareLinkSchema.index({ token: 1 });
// Index for finding all shares by file
ShareLinkSchema.index({ fileId: 1 });
// Index for finding all shares by user
ShareLinkSchema.index({ userId: 1 });

module.exports = mongoose.model('ShareLink', ShareLinkSchema);
