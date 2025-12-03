AI Personal Cloud - Backend API Documentation

Base URL: http://localhost:5000

Auth
- POST /auth/register { email, password } -> returns { token }
- POST /auth/login { email, password } -> returns { token }

Files
- POST /files/upload (form-data: file) -> { message, fileId }
- GET /files -> list of files for logged-in user
- GET /files/download/:id -> returns { url }
- DELETE /files/:id -> deletes file

AI
- POST /ai/process/:id -> re-run processing on a file (requires auth)

Search
- POST /search { q } -> performs semantic search and returns files sorted by similarity

Notes
- All protected routes require Authorization: Bearer <token>
- Files are stored in Minio; the frontend uses presigned URLs for downloads
- Duplicate detection is done via SHA256 hash and perceptual pHash for images
- AI microservice provides embedding and metadata; embeddings stored in Mongo
