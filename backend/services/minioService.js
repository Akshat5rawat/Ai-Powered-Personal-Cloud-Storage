const Minio = require('minio');

const bucket = process.env.MINIO_BUCKET || 'files';

// Internal client for operations within Docker network
const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});

// Public client for generating presigned URLs accessible from network
const publicClient = new Minio.Client({
  endPoint: process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});

async function ensureBucket() {
  try {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
    }
  } catch (err) {
    // Known errors to ignore
    if (err.code && (err.code === 'BucketAlreadyOwnedByYou' || err.code === 'BucketAlreadyExists')) return;
    // older minio npm client may throw "Not Found", in that case try to create
    if (err.message && err.message.includes('Not Found')) {
      await client.makeBucket(bucket);
      return;
    }
    console.error('Minio bucket error', err);
    throw err;
  }
}

async function uploadBuffer(buffer, key, size, meta) {
  await ensureBucket();
  return client.putObject(bucket, key, buffer, size, meta || {});
}

async function removeObject(key) {
  return client.removeObject(bucket, key);
}

async function presignedUrl(key, expirySeconds = 60 * 60) {
  // Use publicClient to generate URLs with the correct hostname in the signature
  return publicClient.presignedGetObject(bucket, key, expirySeconds);
}

function getObjectUrl(key) {
  const host = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT;
  const port = process.env.MINIO_PUBLIC_PORT || process.env.MINIO_PORT;
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
  return `${protocol}://${host}:${port}/${bucket}/${encodeURIComponent(key)}`;
}

module.exports = {
  uploadBuffer,
  removeObject,
  presignedUrl,
  getObjectUrl,
  client,
  bucket
};

module.exports.ensureBucket = ensureBucket;
