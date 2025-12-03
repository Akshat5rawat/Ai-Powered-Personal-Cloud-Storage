Running AI Personal Cloud locally using Docker Compose

Prerequisites
- Docker & Docker Compose installed

Start all services
- Open powershell
- cd to project root
- docker-compose up --build -d

Check logs
- docker-compose logs -f

Stop
- docker-compose down -v

Access
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- Minio UI: http://localhost:9001 (user:minioadmin pass:minioadmin)
- AI microservice Swagger: http://localhost:8000/docs

Test flows
1. Register & login
2. Upload file using Upload page
3. View files in 'My Files'
4. Click Download to get presigned URL
5. Use Search page to perform semantic search

API Docs available in backend/README.md
