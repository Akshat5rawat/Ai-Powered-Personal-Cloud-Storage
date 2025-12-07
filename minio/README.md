Run this is powershell :
Invoke-WebRequest -Uri "https://dl.min.io/server/minio/release/windows-amd64/minio.exe" -OutFile "minio.exe"

Run:
set MINIO_ROOT_USER=minioadmin
set MINIO_ROOT_PASSWORD=minioadmin