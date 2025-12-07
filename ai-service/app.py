
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
import os
from dotenv import load_dotenv
load_dotenv()

import hashlib
from minio import Minio
from pymongo import MongoClient
from bson import ObjectId
import math

# helper to convert hex string to imagehash object
try:
    from imagehash import hex_to_hash
except Exception:
    def hex_to_hash(s):
        # fallback: return None
        return None

from sentence_transformers import SentenceTransformer
from transformers import CLIPProcessor, CLIPModel
import torch
from PIL import Image
import io
import numpy as np
import imagehash
import cv2


# Load models
sbert = SentenceTransformer('all-MiniLM-L6-v2')
clip_model_name = 'openai/clip-vit-base-patch32'
clip_model = CLIPModel.from_pretrained(clip_model_name)
clip_processor = CLIPProcessor.from_pretrained(clip_model_name)

# Setup Minio
MINIO_ENDPOINT = os.getenv('MINIO_ENDPOINT')
MINIO_PORT = os.getenv('MINIO_PORT')
# ensure endpoint contains port
if MINIO_PORT:
    minio_endpoint = f"{MINIO_ENDPOINT}:{MINIO_PORT}"
else:
    minio_endpoint = MINIO_ENDPOINT

minio_client = Minio(
    minio_endpoint,
    access_key=os.getenv('MINIO_ACCESS_KEY'),
    secret_key=os.getenv('MINIO_SECRET_KEY'),
    secure=False,
)
bucket = os.getenv('MINIO_BUCKET', 'files')

# Ensure bucket exists on startup
try:
    if not minio_client.bucket_exists(bucket):
        minio_client.make_bucket(bucket)
        print(f"Created bucket: {bucket}")
except Exception as e:
    print("Minio bucket check failed:", e)

# Mongo
mongo_client = MongoClient(os.getenv('MONGO_URI'))
db = mongo_client.get_default_database()
files_col = db['files']

app = FastAPI(title='AI Microservice')

class ProcessInput(BaseModel):
    fileId: str
    minioKey: str
    mimetype: Optional[str]

class QueryInput(BaseModel):
    query: str
    userId: Optional[str] = None

# utility

def download_from_minio(key):
    data = minio_client.get_object(bucket, key)
    return data.read()


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
    vec = sbert.encode(text)
    return vec.tolist()


def embedding_from_text_clip(text):
    inputs = clip_processor(text=[text], return_tensors='pt', padding=True, truncation=True)
    with torch.no_grad():
        features = clip_model.get_text_features(**inputs)
    features = features / features.norm(p=2, dim=-1, keepdim=True)
    return features[0].cpu().numpy().tolist()


def embedding_from_image_clip(buffer):
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

    # 1. Validate ID immediately
    if not ObjectId.is_valid(file_id):
        raise HTTPException(status_code=400, detail=f"Invalid ObjectId: {file_id}")

    try:
        # 2. Safe MinIO Download
        try:
            buffer = download_from_minio(key)
        except Exception as e:
            print(f"MinIO Error for key {key}: {e}")
            raise HTTPException(status_code=404, detail=f"Could not download file from MinIO: {str(e)}")

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

        # 3. Safe User Fetch
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
