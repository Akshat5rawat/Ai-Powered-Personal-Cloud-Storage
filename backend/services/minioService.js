const { createClient } = require('@supabase/supabase-js');

// Config
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key for backend uploads/deletes
const bucket = process.env.SUPABASE_BUCKET || 'files';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

// Initialize Supabase Client
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Ensures the bucket exists. 
 * Note: In Supabase, you typically create buckets via the Dashboard.
 * This checks if it exists and tries to create it if public/permissions allow.
 */
async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error('Error listing buckets:', error);
    return;
  }
  
  const bucketExists = buckets.find(b => b.name === bucket);
  if (!bucketExists) {
    console.log(`Bucket '${bucket}' not found. Attempting to create...`);
    const { error: createError } = await supabase.storage.createBucket(bucket, {
      public: false // Set to true if you want public URLs to work without signing
    });
    if (createError) {
      console.error('Error creating bucket:', createError);
      // Don't throw here to avoid crashing if it's just a permission issue and bucket exists
    }
  }
}

/**
 * Uploads a buffer to Supabase Storage
 */
async function uploadBuffer(buffer, key, size, meta = {}) {
  // Supabase upload options
  const options = {
    contentType: meta.mimetype || 'application/octet-stream',
    upsert: true
  };

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(key, buffer, options);

  if (error) throw error;
  return data;
}

/**
 * Removes an object from Supabase Storage
 */
async function removeObject(key) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .remove([key]);

  if (error) throw error;
  return data;
}

/**
 * Generates a presigned URL (valid for a limited time)
 */
async function presignedUrl(key, expirySeconds = 60 * 60) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, expirySeconds);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Generates a public URL (Requires bucket to be 'Public' in Supabase dashboard)
 */
function getObjectUrl(key) {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(key);
  
  return data.publicUrl;
}

module.exports = {
  uploadBuffer,
  removeObject,
  presignedUrl,
  getObjectUrl,
  client: supabase, // Exporting as 'client' to maintain compatibility
  bucket,
  ensureBucket
};