AI-Powered Personal Cloud — Architecture & Runbook

Overview
--------
This document explains architecture, components, and working details of the AI-Powered Personal Cloud Storage System implemented in this repository.

This project offers an MVP for an AI-enhanced cloud storage system (Dropbox/Google Drive-like) with features such as:
- File upload with metadata stored in MongoDB
- File storage in Minio (S3-compatible) with presigned downloads
- JWT Auth for user sessions
- AI microservice (FastAPI) for: auto-categorization, embedding extraction, duplicate detection (SHA256 + pHash) and semantic search
- Frontend built with React + Tailwind
- Backend built with Node.js + Express

Repo layout (important files)
-----------------------------
- `docker-compose.yml` — orchestrates MongoDB, Minio, backend, frontend, AI service.
- `backend/` — Node.js Express app (api, models, routes, services).
  - `index.js` — server entry
  - `routes/` — endpoints (`auth.js`, `files.js`, `search.js`, `ai.js`)
  - `models/` — Mongoose `User`, `File`
  - `services/minioService.js` — Minio client & helpers
  - `services/aiService.js` — AI microservice client
  - `middleware/auth.js` — JWT auth middleware
  - `utils/crypto.js` — sha256 helper
- `ai-service/` — FastAPI microservice that processes files and serves semantic search
  - `app.py` — FastAPI server
  - `requirements.txt` — Python packages
- `frontend/` — React + Tailwind client UX
  - `src/` — components, pages, API client
- `docs/` — runbook, architecture docs (this file)

High-level architecture
-----------------------
Users interact with the React frontend which calls the backend APIs (JWT-protected). The backend saves files to Minio and metadata to MongoDB, then triggers the AI microservice which computes embeddings and other metadata (category, SHA256, pHash) and updates the file document. The frontend can initiate semantic search which performs an embedding-based search through the AI microservice.


Component responsibilities
--------------------------
- Frontend (`frontend/`): UI/UX. Uses `src/api.js` as a centralized axios client to include JWT token. Pages include `Login`, `Register`, `Upload`, `Files`, `Search`.
- Backend (`backend/`): accepts uploads, stores files in Minio, stores metadata in MongoDB using Mongoose, exposes REST endpoints including `GET /files` and `POST /files/upload`, `POST /ai/process/:id`, `POST /search`, `POST /search/keyword`. Uses `Minio` SDK and `axios` to call AI microservice. Performs duplicate detection checks and updates records.
- Minio: S3-compatible object storage. Stores raw file bytes. Backed by Docker Compose using persistent volumes.
- MongoDB: Metadata store for users and files. Stores embedding vectors, hashes, flags, and more.
- AI microservice (`ai-service/`): FastAPI service that performs computationally expensive tasks offline or synchronously:
  - Downloads file from Minio
  - Computes SHA256 for exact duplicates
  - Computes pHash for images and detects near-duplicates using Hamming distance of pHash values
  - Computes embeddings: Image -> CLIP; Text -> sBERT (sentence-transformers)
  - Returns the computed metadata and updates Mongo records
  - Handles semantic search and returns ranking based on cosine similarity

Data models & fields
---------------------
The key MongoDB models are `User` and `File`.

File fields (via `backend/models/File.js`):
- `userId`: ObjectId -> `User` (owner of the file)
- `filename`: original filename (string)
- `size`: file size (number)
- `mimetype`: content MIME type (string)
- `minioKey`: minio object key for retrieving the file
- `category`: auto-assigned category (image, invoice, resume, notes, document, file)
- `embedding`: float array (embedding vector, length depends on method)
- `embeddingType`: 'sbert' | 'clip_image' (indicates embedding model)
- `hash`: SHA256 hex string for exact duplicates
- `pHash`: perceptual hash string for images (imagehash library)
- `duplicate`: boolean indicating a duplicate
- `duplicateOf`: ObjectId reference to a file that is duplicated
- `createdAt`: created timestamp

AI Microservice — How it works
------------------------------
API endpoints:
- `POST /process-file` — input: `{ fileId, minioKey, mimetype }`.
  Process:
  1. Download from Minio.
  2. Compute SHA256: exact duplicate detection for all files.
  3. If image: compute pHash (imagehash), compute CLIP image embedding and set `embeddingType = 'clip_image'`. Use pHash Hamming distance <= 6 to mark near duplicates for same user.
  4. If text or document: compute sBERT text embedding; run heuristics to detect `invoice`, `resume`, `report`, `notes`, `document`.
  5. Save results to `files` collection (Mongo) with `category`, `embedding`, `hash`, `pHash`, `embeddingType`, and duplicate details.
  6. Return the computed metadata in response.

- `POST /semantic-search` — input: `{ query, userId? }` — compute sBERT and CLIP text embeddings and compare with existing `embedding` arrays in MongoDB. Compute cosine similarity and return results sorted by score. If `userId` is provided, results will be filtered to that user's files.

Embedding choices
- sBERT `all-MiniLM-L6-v2` used for text embedding (compact & fast); stored as float list.
- CLIP `openai/clip-vit-base-patch32` used for image embeddings. For image-text cross-modal search, clip text embeddings and clip image embeddings can be compared.

Semantic search & similarity
- Cosine similarity between query embedding (prefer sBERT for document queries, clip text for image search) and stored embeddings; results returned sorted.
- The backend's `/search` route calls the AI microservice `/semantic-search` to offload computation and receive ranked file IDs and scores, then maps file IDs to metadata to enrich response.

Duplicate detection
- Exact duplicates: SHA256 comparison. If a file's SHA matches an existing file in the user's files, mark `duplicate = true` and `duplicateOf` to the match.
- Near duplicates for images: pHash difference (Hamming distance) less than threshold (6) considered near duplicates. This is performed in the AI microservice with the `imagehash` library.

File storage & key strategy
---------------------------
- Minio bucket configured in `backend/.env` and `ai-service/.env` as `files`.
- Keys are generated as: `<userId>/<timestamp>_<originalfilename>`. This allows an easy mapping from object to user and avoids collisions.
- On download, backend returns a presigned URL generated with Minio SDK and a short expiry (default 1 hour). The frontend uses these presigned URLs for secure downloads.

Security
--------
- JWT-based authentication (short-lived tokens can be configured). Implemented by `backend/middleware/auth.js` and is required for all user-specific routes.
- Secrets: `JWT_SECRET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` are environment variables and should not be checked into source control.
- Presigned download URLs are short-lived and not stored permanently.

Deployment & Running locally
----------------------------
Prerequisites: Docker & Docker Compose installed (and running on Windows - start Docker Desktop). You may run services locally without containers for faster iteration if you prefer.

Using Docker Compose (preferred):
- From PowerShell in repository root:
  - Start everything:
    docker-compose up --build -d
  - Monitor logs (optional):
    docker-compose logs -f
  - Stop everything:
    docker-compose down -v

Dev/Local (run services individually)
- Backend (Node):
  cd backend
  npm install
  npm start
- Frontend (React):
  cd frontend
  npm install
  npm start
  - If the frontend is running in Docker, `REACT_APP_API_URL` should point to `http://backend:5000` in `frontend/.env`. For local dev, keep `http://localhost:5000`.
- AI microservice (FastAPI):
  cd ai-service
  python -m venv venv
  .\venv\Scripts\Activate (PowerShell)
  pip install -r requirements.txt
  uvicorn app:app --reload --host 0.0.0.0 --port 8000

Important: The AI microservice will download large transformer models (SentenceTransformers and CLIP) when first built or run; this can take time & requires enough disk/CPU/RAM.

API Reference — Short
---------------------
- `POST /auth/register` -> Input: `{ email, password }` -> returns `{ token }`
- `POST /auth/login` -> Input: `{ email, password }` -> returns `{ token }`
- `POST /files/upload` (form-data: `file`) -> returns `{ message: "Uploaded", fileId }`
- `GET /files` -> returns user's list of files (metadata)
- `GET /files/download/:id` -> returns `{ url }` (presigned Minio URL)
- `DELETE /files/:id` -> delete a file record and its object in Minio
- `POST /ai/process/:id` -> re-run AI processing on an existing file
- `POST /search` -> `{ q }` semantic search — returns `results` as array of `{ file, score }` (backend maps AI microservice file IDs to full metadata)
- `POST /search/keyword` -> Mongo keyword search (text index on filename and category) — returns `results` as file list

Quick cURL examples (PowerShell syntax)
-------------------------------------
- Register user:
  $body = @{ email = 'alice@example.com'; password = 'pass' } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/auth/register' -Body $body -ContentType 'application/json'

- Login:
  $body = @{ email = 'alice@example.com'; password = 'pass' } | ConvertTo-Json
  $r = Invoke-RestMethod -Method Post -Uri 'http://localhost:5000/auth/login' -Body $body -ContentType 'application/json'
  $token = $r.token

- Upload file (PowerShell, the form upload requires proper multipart formatting):
  $token = '<token-here>'
  Invoke-RestMethod -Uri 'http://localhost:5000/files/upload' -Headers @{ Authorization = "Bearer $token" } -Method Post -InFile 'C:\path\to\myfile.jpg' -ContentType 'multipart/form-data'

- Use the web UI (frontend) for standard workflows: register, login, upload files, browse files, download, delete & search.

Notes on running under Docker vs local dev
----------------------------------------
- If running `frontend` inside Docker Compose, ensure `REACT_APP_API_URL` in `frontend/.env` points to `http://backend:5000` (Docker internal network), otherwise use `http://localhost:5000` when running locally.
- The AI microservice and backend talk to Minio/Mongo in Docker Compose with service names, not `localhost`. Check `backend/.env` and `ai-service/.env`.

Troubleshooting
---------------
- "Docker Desktop not running": start Docker Desktop and ensure the Docker daemon has started.
- "AI service taking long to start": large transformers (sBERT/CLIP) are downloaded on startup; give it time or run AI service locally for faster iterations.
- "Minio bucket not found": ensure the minio container is up and credentials correct. On first startup, both backend and AI microservice attempt to ensure bucket existence.
- Missing env variables: Ensure `.env` files exist and contain correct values in `backend/` and `ai-service/`.
- Permission issues on downloads or presigned URLs: `presignedGetObject()` uses minio credentials; ensure Minio `root user` and `password` match env.

Production considerations & improvements
--------------------------------------
- Replace Mongo embedded search with a vector DB (Milvus, Pinecone, Weaviate, or FAISS) for large-scale embedding similarity searches.
- Use background worker (Redis + Bull) or a task queue to process AI computations asynchronously (upload -> enqueue job -> worker -> update DB). This improves UX and throughput.
- Cache embeddings and add an indexing pipeline for better performance.
- Use multi-tenant S3 (or hosted S3) and secure key management, rotate minio/S3 keys, configure least privilege policies.
- Add more robust document parsing for PDFs, Office (Textract, Tika, or Apache Tika) including OCR for images.
- Add tests: unit, integration, CI/CD pipelines.

Roadmap & possible features
---------------------------
- Thumbnail generation for images
- Metadata extraction for documents
- File previews in the UI
- Versioning of files
- Large file uploads (multipart upload)
- Background processing of AI tasks with progress reporting
- Add role & permission controls for shared files
- Add user storage quotas & billing support

Contact & Contributing
----------------------
- See the project `README.md` for high-level run instructions and `docs/RUN.md` for practical runbook steps.
- For contributions: fork, make changes, and submit a PR following the patterns in this repo (API routes in `backend/routes`, AI logic in `ai-service/app.py`).

MVP Feature checklist
---------------------
- [x] Upload files
- [x] Save metadata in MongoDB
- [x] Store files in Minio bucket
- [x] View files and metadata in the UI
- [x] Secure downloads via Minio pre-signed URLs
- [x] Delete files & objects
- [x] Auto categorize files (basic heuristics)
- [x] Extract embeddings (sBERT & CLIP)
- [x] Duplicate detection (SHA256 + pHash)
- [x] Semantic search via embeddings

End of document
---------------
If you want, I can:
- Add a simple architecture diagram (ASCII or mermaid). 
- Add specific production setup for S3 and AWS IAM policy folder.
- Add CI/CD scripts for Docker Build and Kubernetes manifests.

