
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import os
from dotenv import load_dotenv
load_dotenv()

import hashlib
# [CHANGED] Import Supabase
from supabase import create_client, Client
from pymongo import MongoClient
from bson import ObjectId
import math
import re

# helper to convert hex string to imagehash object
try:
    from imagehash import hex_to_hash
except Exception:
    def hex_to_hash(s):
        return None

import torch
from PIL import Image
import io
import numpy as np
import imagehash
import cv2


# Lazy-loaded model instances for core AI features (SBERT, CLIP)
_models = {
    "sbert": None,
    "clip_model": None,
    "clip_processor": None,
}


def get_sbert():
    """Lazy load SentenceTransformer model"""
    if _models["sbert"] is None:
        print("Loading SentenceTransformer model...")
        from sentence_transformers import SentenceTransformer
        _models["sbert"] = SentenceTransformer('all-MiniLM-L6-v2')
        print("SentenceTransformer loaded.")
    return _models["sbert"]


def get_clip():
    """Lazy load CLIP model and processor"""
    if _models["clip_model"] is None or _models["clip_processor"] is None:
        print("Loading CLIP model...")
        from transformers import CLIPProcessor, CLIPModel
        clip_model_name = 'openai/clip-vit-base-patch32'
        _models["clip_model"] = CLIPModel.from_pretrained(clip_model_name)
        _models["clip_processor"] = CLIPProcessor.from_pretrained(clip_model_name, use_fast=True)
        print("CLIP model loaded.")
    return _models["clip_model"], _models["clip_processor"]


print("AI service starting (models will be lazy-loaded on first use)...")

# [CHANGED] Setup Supabase
SUPABASE_URL = os.getenv('SUPABASE_URL')
# Use Service Role Key for backend access
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') 
SUPABASE_BUCKET = os.getenv('SUPABASE_BUCKET', 'files')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.")
    supabase = None
else:
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"Supabase client initialized for bucket: {SUPABASE_BUCKET}")
    except Exception as e:
        print(f"Supabase init failed: {e}")
        supabase = None
# Mongo
mongo_client = MongoClient(os.getenv('MONGO_URI'))
try:
    db = mongo_client.get_default_database()
except Exception:
    db = mongo_client['ai_personal_cloud']

files_col = db['files']

app = FastAPI(title='AI Microservice')

# Startup event to warm up models in background
@app.on_event("startup")
async def startup_event():
    """Warm up AI models in background after server starts."""
    import asyncio
    import threading
    
    def warmup_in_thread():
        """Run model warmup in a separate thread to not block startup."""
        try:
            # Import here to avoid circular imports
            from summarization import warmup_models
            print("Starting model warmup in background...")
            warmup_models()
        except Exception as e:
            print(f"Model warmup failed: {e}")
    
    # Start warmup in background thread after small delay
    def delayed_warmup():
        import time
        time.sleep(5)  # Wait 5 seconds for server to fully start
        warmup_in_thread()
    
    thread = threading.Thread(target=delayed_warmup, daemon=True)
    thread.start()
    print("Model warmup scheduled.")

class ProcessInput(BaseModel):
    fileId: str
    minioKey: str # Keeping this name to maintain compatibility with Node.js backend
    mimetype: Optional[str]

class QueryInput(BaseModel):
    query: str
    userId: Optional[str] = None

# utility

# [CHANGED] Download from Supabase Storage
def download_from_supabase(key):
    if not supabase:
        raise Exception("Supabase client not initialized")
    
    # storage.from_() is used because 'from' is a reserved keyword in Python
    # download() returns bytes directly
    data = supabase.storage.from_(SUPABASE_BUCKET).download(key)
    return data


def sha256_hash(buffer):
    h = hashlib.sha256()
    h.update(buffer)
    return h.hexdigest()


def phash_image(buffer):
    try:
        img = Image.open(io.BytesIO(buffer)).convert('RGB')
        ph = str(imagehash.phash(img))
        return ph
    except Exception as e:
        return None


def embedding_from_text_sbert(text):
    sbert = get_sbert()
    vec = sbert.encode(text)
    return vec.tolist()


def embedding_from_text_clip(text):
    clip_model, clip_processor = get_clip()
    inputs = clip_processor(text=[text], return_tensors='pt', padding=True, truncation=True)
    with torch.no_grad():
        features = clip_model.get_text_features(**inputs)
    features = features / features.norm(p=2, dim=-1, keepdim=True)
    return features[0].cpu().numpy().tolist()


def embedding_from_image_clip(buffer):
    clip_model, clip_processor = get_clip()
    img = Image.open(io.BytesIO(buffer)).convert('RGB')
    inputs = clip_processor(images=img, return_tensors='pt')
    with torch.no_grad():
        features = clip_model.get_image_features(**inputs)
    features = features / features.norm(p=2, dim=-1, keepdim=True)
    return features[0].cpu().numpy().tolist()


@app.post('/process-file')
async def process_file(payload: ProcessInput):
    import traceback # Ensure this is imported
    
    key = payload.minioKey
    file_id = payload.fileId
    mimetype = (payload.mimetype or '').lower()

    if not ObjectId.is_valid(file_id):
        raise HTTPException(status_code=400, detail=f"Invalid ObjectId: {file_id}")

    try:
        # [CHANGED] Safe Supabase Download
        try:
            buffer = download_from_supabase(key)
        except Exception as e:
            print(f"Supabase Error for key {key}: {e}")
            raise HTTPException(status_code=404, detail=f"Could not download file from Supabase: {str(e)}")

        # SHA256
        h = sha256_hash(buffer)
        
        # defaults
        embedding = []
        category = 'unknown'
        phash = None
        embedding_type = 'sbert'
        duplicate = False
        duplicate_of = None
        user_id = None

        # Fetch User from Mongo
        file_doc = files_col.find_one({'_id': ObjectId(file_id)})
        if file_doc:
            user_id = file_doc.get('userId')
        else:
            print(f"Warning: No document found in Mongo for ID {file_id}")

        # process images
        if 'image' in mimetype:
            ph = phash_image(buffer)
            phash = ph
            embedding = embedding_from_image_clip(buffer)
            category = 'image'
            embedding_type = 'clip_image'

            if h:
                existing = files_col.find_one({'hash': h, '_id': { '$ne': ObjectId(file_id) }})
                if existing:
                    duplicate = True
                    duplicate_of = str(existing['_id'])

            if not duplicate and phash:
                current_hash = hex_to_hash(phash)
                if current_hash: # Check if hash generation worked
                    query = { 'pHash': { '$exists': True } }
                    if user_id:
                        query['userId'] = user_id # MongoDB driver usually handles string vs ObjectId auto-conversion, but be careful here
                    
                    candidates = list(files_col.find(query))
                    for c in candidates:
                        try:
                            ch = hex_to_hash(c.get('pHash'))
                            if ch and (current_hash - ch <= 6):
                                duplicate = True
                                duplicate_of = str(c.get('_id'))
                                break
                        except Exception:
                            continue

        elif any(x in mimetype for x in ['pdf', 'text', 'msword', 'officedocument']):
            # For PDFs and Office docs, use filename for categorization
            filename = key.split('/')[-1].lower()
            
            # Try to extract text for embedding (only for plain text files)
            if 'text' in mimetype:
                try:
                    txt = buffer.decode('utf-8', errors='ignore')
                except Exception:
                    txt = filename
            else:
                # For PDFs/Office docs, use filename instead of binary content
                txt = filename.replace('_', ' ').replace('-', ' ')
            
            # Limit text length for SBERT to prevent crashes on massive files
            embedding = embedding_from_text_sbert(txt[:5000]) 
            
            # Categorize based on mimetype first, then filename
            if 'presentation' in mimetype or filename.endswith(('.ppt', '.pptx')):
                category = 'presentation'
            elif 'spreadsheet' in mimetype or filename.endswith(('.xls', '.xlsx', '.csv')):
                category = 'spreadsheet'
            elif 'pdf' in mimetype or filename.endswith('.pdf'):
                # Check filename for common document types
                if any(word in filename for word in ['invoice', 'bill', 'receipt']):
                    category = 'invoice'
                elif any(word in filename for word in ['resume', 'cv']):
                    category = 'resume'
                elif any(word in filename for word in ['report', 'analysis']):
                    category = 'report'
                else:
                    category = 'pdf'
            elif 'text' in mimetype:
                if any(word in txt.lower() for word in ['invoice', 'bill']):
                    category = 'invoice'
                elif any(word in txt.lower() for word in ['note', 'memo']):
                    category = 'notes'
                else:
                    category = 'text'
            else:
                category = 'document'
            
            if h:
                existing = files_col.find_one({'hash': h, '_id': { '$ne': ObjectId(file_id) }})
                if existing:
                    duplicate = True
                    duplicate_of = str(existing['_id'])

        else:
            # Fallback
            embedding = embedding_from_text_sbert(key.split('/')[-1].replace('_', ' '))
            category = 'file'
            
            if h:
                existing = files_col.find_one({'hash': h, '_id': { '$ne': ObjectId(file_id) }})
                if existing:
                    duplicate = True
                    duplicate_of = str(existing['_id'])

        # Save to Mongo
        update_data = {
            'category': category,
            'embedding': embedding,
            'embeddingType': embedding_type,
            'hash': h,
            'pHash': phash,
            'duplicate': duplicate,
            'duplicateOf': ObjectId(duplicate_of) if duplicate_of else None
        }
        
        files_col.update_one({'_id': ObjectId(file_id)}, {'$set': update_data})

        return { 
            'status': 'processed',
            'fileId': file_id,
            'category': category, 
            'duplicate': duplicate 
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        traceback.print_exc() # <--- THIS IS KEY FOR DEBUGGING
        raise HTTPException(status_code=500, detail=f"Internal Error: {str(e)}")

@app.post('/semantic-search')
async def semantic_search(payload: QueryInput):
    q = payload.query
    userId = getattr(payload, 'userId', None)
    if not q:
        raise HTTPException(status_code=400, detail='Missing query')
    # compute both sbert and clip text embeddings
    sbert_emb = embedding_from_text_sbert(q)
    clip_text_emb = embedding_from_text_clip(q)

    # fetch files for userId if present otherwise all files
    query = {}
    if userId:
        try:
            query['userId'] = ObjectId(userId)
        except Exception:
            query['userId'] = userId
    files = list(files_col.find(query, { 'filename': 1, 'category': 1, 'embedding': 1, 'embeddingType': 1 }))

    def cosine(a, b):
        if not a or not b:
            return 0.0
        dot = sum(x*y for x, y in zip(a, b))
        magA = math.sqrt(sum(x*x for x in a))
        magB = math.sqrt(sum(x*x for x in b))
        if magA == 0 or magB == 0:
            return 0.0
        return dot / (magA*magB)

    results = []
    for f in files:
        emb = f.get('embedding') or []
        if not emb:
            continue
        etype = f.get('embeddingType', 'sbert')
        score = 0.0
        try:
            if etype == 'clip_image':
                # compare clip_text_emb with image embedding
                score = cosine(clip_text_emb, emb)
            elif etype == 'sbert':
                score = cosine(sbert_emb, emb)
            else:
                # fallback: combine both
                score1 = cosine(sbert_emb, emb)
                score2 = cosine(clip_text_emb, emb)
                score = max(score1, score2)
        except Exception:
            score = 0.0
        results.append({'fileId': str(f['_id']), 'filename': f.get('filename'), 'category': f.get('category'), 'score': float(score)})

    results.sort(key=lambda x: x['score'], reverse=True)
    return { 'results': results }


# ==================== SUMMARIZATION ENDPOINTS ====================
# Import summarization functions from separate module
from summarization import (
    is_summarizable_mimetype,
    process_file_for_summary,
    SUMMARIZER_AVAILABLE,
    BLIP_AVAILABLE,
    warmup_models
)

class SummarizeInput(BaseModel):
    fileId: str
    minioKey: str
    mimetype: Optional[str]


@app.post('/summarize')
async def summarize_file(payload: SummarizeInput):
    """Generate AI summary for a document or image."""
    import traceback
    from datetime import datetime
    
    key = payload.minioKey
    file_id = payload.fileId
    mimetype = (payload.mimetype or '').lower()
    
    if not ObjectId.is_valid(file_id):
        raise HTTPException(status_code=400, detail=f"Invalid ObjectId: {file_id}")
    
    # Check if already summarized
    file_doc = files_col.find_one({'_id': ObjectId(file_id)})
    if file_doc and file_doc.get('summary') and file_doc.get('summaryStatus') == 'completed':
        generated_at = file_doc.get('summaryGeneratedAt')
        # Convert to ISO format string if it's a datetime object
        if generated_at and hasattr(generated_at, 'isoformat'):
            generated_at = generated_at.isoformat() + 'Z'
        return {
            'status': 'already_summarized',
            'fileId': file_id,
            'summary': file_doc.get('summary'),
            'generatedAt': generated_at
        }
    
    # Check if mimetype is supported
    if not is_summarizable_mimetype(mimetype):
        files_col.update_one(
            {'_id': ObjectId(file_id)},
            {'$set': {
                'summaryStatus': 'unsupported',
                'summaryError': f'File type {mimetype} is not supported for summarization'
            }}
        )
        return {
            'status': 'unsupported',
            'fileId': file_id,
            'message': f'File type {mimetype} is not supported for summarization'
        }
    
    # Mark as processing
    files_col.update_one(
        {'_id': ObjectId(file_id)},
        {'$set': {'summaryStatus': 'processing'}}
    )
    
    try:
        # Download file from Supabase
        try:
            buffer = download_from_supabase(key)
        except Exception as e:
            print(f"Supabase Error for key {key}: {e}")
            files_col.update_one(
                {'_id': ObjectId(file_id)},
                {'$set': {'summaryStatus': 'failed', 'summaryError': str(e)}}
            )
            raise HTTPException(status_code=404, detail=f"Could not download file from Supabase: {str(e)}")
        
        # Process file and generate summary using the summarization module
        summary = process_file_for_summary(buffer, mimetype)
        
        # Save summary to database
        files_col.update_one(
            {'_id': ObjectId(file_id)},
            {'$set': {
                'summary': summary,
                'summaryGeneratedAt': datetime.utcnow(),
                'summaryStatus': 'completed',
                'summaryError': None
            }}
        )
        
        return {
            'status': 'completed',
            'fileId': file_id,
            'summary': summary,
            'generatedAt': datetime.utcnow().isoformat() + 'Z'
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        traceback.print_exc()
        files_col.update_one(
            {'_id': ObjectId(file_id)},
            {'$set': {'summaryStatus': 'failed', 'summaryError': str(e)}}
        )
        raise HTTPException(status_code=500, detail=f"Summarization failed: {str(e)}")


@app.get('/summary/{file_id}')
async def get_summary(file_id: str):
    """Get existing summary for a file."""
    if not ObjectId.is_valid(file_id):
        raise HTTPException(status_code=400, detail=f"Invalid ObjectId: {file_id}")
    
    file_doc = files_col.find_one({'_id': ObjectId(file_id)})
    if not file_doc:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {
        'fileId': file_id,
        'summary': file_doc.get('summary'),
        'summaryStatus': file_doc.get('summaryStatus'),
        'summaryGeneratedAt': file_doc.get('summaryGeneratedAt'),
        'summaryError': file_doc.get('summaryError')
    }


class BackfillInput(BaseModel):
    batchSize: Optional[int] = 5
    userId: Optional[str] = None


@app.post('/summary/backfill')
async def backfill_summaries(payload: BackfillInput):
    """
    Backfill summaries for files that don't have them.
    Processes files in batches to avoid overload.
    """
    from datetime import datetime
    import traceback
    
    batch_size = min(payload.batchSize or 5, 20)  # Cap at 20
    user_id = payload.userId
    
    # Build query for files needing summaries
    query = {
        '$or': [
            {'summary': None, 'summaryStatus': {'$nin': ['pending', 'processing', 'unsupported', 'completed']}},
            {'summaryStatus': 'failed'}
        ]
    }
    
    # Filter by user if specified
    if user_id:
        try:
            query['userId'] = ObjectId(user_id)
        except Exception:
            query['userId'] = user_id
    
    # Find files needing summaries
    files = list(files_col.find(query).limit(batch_size))
    
    # Filter to summarizable types
    summarizable_files = [
        f for f in files 
        if is_summarizable_mimetype(f.get('mimetype', ''))
    ]
    
    if not summarizable_files:
        return {
            'status': 'complete',
            'message': 'No files need summarization',
            'processed': 0,
            'remaining': 0
        }
    
    results = {
        'processed': 0,
        'succeeded': 0,
        'failed': 0,
        'details': []
    }
    
    for file_doc in summarizable_files:
        file_id = str(file_doc['_id'])
        minio_key = file_doc.get('minioKey', '')
        mimetype = file_doc.get('mimetype', '')
        filename = file_doc.get('filename', 'unknown')
        
        try:
            # Mark as processing
            files_col.update_one(
                {'_id': file_doc['_id']},
                {'$set': {'summaryStatus': 'processing'}}
            )
            
            # Download file
            buffer = download_from_supabase(minio_key)
            
            # Generate summary
            summary = process_file_for_summary(buffer, mimetype)
            
            # Save to database
            files_col.update_one(
                {'_id': file_doc['_id']},
                {'$set': {
                    'summary': summary,
                    'summaryGeneratedAt': datetime.utcnow(),
                    'summaryStatus': 'completed',
                    'summaryError': None
                }}
            )
            
            results['succeeded'] += 1
            results['details'].append({
                'fileId': file_id,
                'filename': filename,
                'status': 'completed'
            })
            
        except Exception as e:
            traceback.print_exc()
            files_col.update_one(
                {'_id': file_doc['_id']},
                {'$set': {
                    'summaryStatus': 'failed',
                    'summaryError': str(e)
                }}
            )
            results['failed'] += 1
            results['details'].append({
                'fileId': file_id,
                'filename': filename,
                'status': 'failed',
                'error': str(e)
            })
        
        results['processed'] += 1
    
    # Count remaining files
    remaining = files_col.count_documents(query) - results['processed']
    
    return {
        'status': 'batch_complete',
        'processed': results['processed'],
        'succeeded': results['succeeded'],
        'failed': results['failed'],
        'remaining': max(0, remaining),
        'details': results['details']
    }


@app.get('/summary/stats')
async def get_summary_stats():
    """Get statistics about summary generation status."""
    pipeline = [
        {
            '$group': {
                '_id': '$summaryStatus',
                'count': {'$sum': 1}
            }
        }
    ]
    
    stats = list(files_col.aggregate(pipeline))
    
    stats_map = {
        'completed': 0,
        'pending': 0,
        'processing': 0,
        'failed': 0,
        'unsupported': 0,
        'no_status': 0
    }
    
    for s in stats:
        status = s['_id']
        if status is None:
            stats_map['no_status'] = s['count']
        else:
            stats_map[status] = s['count']
    
    total = sum(stats_map.values())
    needs_summary = stats_map['no_status'] + stats_map['failed']
    
    return {
        'totalFiles': total,
        'summaryStats': stats_map,
        'needsSummary': needs_summary,
        'completionRate': round(stats_map['completed'] / total * 100, 2) if total > 0 else 0
    }

