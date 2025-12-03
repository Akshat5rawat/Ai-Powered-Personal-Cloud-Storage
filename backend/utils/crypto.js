const crypto = require('crypto');

function sha256(buffer) {
  const h = crypto.createHash('sha256');
  h.update(buffer);
  return h.digest('hex');
}

module.exports = { sha256 };
