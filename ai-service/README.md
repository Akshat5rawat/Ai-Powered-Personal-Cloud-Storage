AI Microservice (FastAPI)

Endpoints:
- POST /process-file -> { fileId, minioKey, mimetype }
- POST /semantic-search -> { query, (optional) userId }

This service downloads files from Minio, computes SHA256, pHash for images, embeddings using CLIP (images) and sBERT (text). It updates metadata in MongoDB files collection.

Run (locally):
- pip install -r requirements.txt
- uvicorn app:app --reload

Notes:
- Containerized via Dockerfile; the Dockerfile installs system deps for pillow/opencv.
