AI Personal Cloud - Backend

Run:

1. docker-compose up --build

API endpoints:

POST /auth/register { email, password }
POST /auth/login { email, password }
POST /files/upload FormData file
GET /files
GET /files/download/:id
DELETE /files/:id
POST /search { q }
