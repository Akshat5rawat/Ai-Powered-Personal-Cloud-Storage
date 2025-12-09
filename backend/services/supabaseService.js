const { createClient } = require('@supabase/supabase-js');

const bucket = process.env.SUPABASE_BUCKET || 'files';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function ensureBucket() {
  try {
    // Check if bucket exists
    const { data, error } = await supabase.storage.getBucket(bucket);
    
    if (error && error.message.includes('not found')) {
      // Create bucket if it doesn't exist
      const { data: createData, error: createError } = await supabase.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 52428800, // 50MB
      });
      
      if (createError && !createError.message.includes('already exists')) {
        throw createError;
      }
    } else if (error) {
      throw error;
    }
  } catch (err) {
    // Ignore if bucket already exists
    if (err.message && err.message.includes('already exists')) {
      return;
    }
    console.error('Supabase bucket error', err);
    throw err;
  }
}

async function uploadBuffer(buffer, key, size, meta) {
  await ensureBucket();
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(key, buffer, {
      contentType: meta?.['Content-Type'] || 'application/octet-stream',
      upsert: true,
    });
  
  if (error) {
    throw error;
  }
  
  return data;
}

async function removeObject(key) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .remove([key]);
  
  if (error) {
    throw error;
  }
  
  return data;
}

async function presignedUrl(key, expirySeconds = 60 * 60) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(key, expirySeconds);
  
  if (error) {
    throw error;
  }
  
  return data.signedUrl;
}

function getObjectUrl(key) {
  // For Supabase, return the public URL (if bucket is public) or a signed URL
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
  ensureBucket,
  supabase,
  bucket
};
