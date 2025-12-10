import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api';
import { isAuthenticated } from '../utils/auth';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalFiles: 0, totalSize: 0 });
  const [recentFiles, setRecentFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [file, setFile] = useState(null);
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota] = useState(10 * 1024 * 1024 * 1024); // 10GB
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    loadDashboardData();
  }, [navigate]);

  const loadDashboardData = async () => {
    try {
      const filesRes = await client.get('/files');
      const files = filesRes.data;
      
      const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
      setStats({
        totalFiles: files.length,
        totalSize: totalSize
      });
      setStorageUsed(totalSize);
      setRecentFiles(files.slice(0, 5).reverse());
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      alert('Please select a file');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    const form = new FormData();
    form.append('file', file);

    try {
      const res = await client.post('/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });
      alert('File uploaded successfully!');
      setFile(null);
      setUploadProgress(0);
      loadDashboardData();
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const storagePercent = (storageUsed / storageQuota) * 100;

  return (
    <div className="dashboard-container">
      <div className="dashboard-hero">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">Welcome to your AI-powered personal cloud. Use the navigation to upload files, browse or search.</p>
      </div>

      {/* Quick Upload Section */}
      <div className="quick-upload-section">
        <div className="upload-card">
          <h3 className="upload-title">Quick Upload</h3>
          <form onSubmit={handleUpload} className="upload-form">
            <div className="file-input-wrapper">
              <input 
                type="file" 
                onChange={e => setFile(e.target.files[0])}
                disabled={uploading}
                className="file-input"
              />
              <span className="file-input-label">
                {file ? file.name : 'Choose a file...'}
              </span>
            </div>
            <button 
              type="submit" 
              disabled={uploading || !file}
              className="upload-button"
            >
              {uploading ? `Uploading... ${uploadProgress}%` : 'Upload'}
            </button>
            {uploading && <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>}
          </form>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="dashboard-cards">
        <div className="dashboard-card clickable" onClick={() => navigate('/upload')}>
          <div className="card-icon">📤</div>
          <h3 className="card-title">Upload Files</h3>
          <p className="card-description">Securely upload and store your files in the cloud</p>
          <p className="card-stat">{stats.totalFiles} files stored</p>
        </div>
        <div className="dashboard-card clickable" onClick={() => navigate('/files')}>
          <div className="card-icon">📁</div>
          <h3 className="card-title">Browse Files</h3>
          <p className="card-description">Organize and manage all your stored files</p>
          <p className="card-stat">{formatBytes(stats.totalSize)}</p>
        </div>
        <div className="dashboard-card clickable" onClick={() => navigate('/search')}>
          <div className="card-icon">🔍</div>
          <h3 className="card-title">Smart Search</h3>
          <p className="card-description">Find your files instantly with AI-powered search</p>
          <p className="card-stat">AI-Powered</p>
        </div>
      </div>

      {/* Storage Info */}
      <div className="storage-section">
        <div className="storage-card">
          <h3 className="storage-title">Storage Usage</h3>
          <div className="storage-info">
            <p className="storage-used">{formatBytes(storageUsed)}</p>
            <p className="storage-quota">of {formatBytes(storageQuota)}</p>
          </div>
          <div className="storage-bar">
            <div className="storage-progress" style={{ width: `${storagePercent}%` }}></div>
          </div>
          <p className="storage-percent">{Math.round(storagePercent)}% used</p>
        </div>
      </div>

      {/* Recent Files */}
      {recentFiles.length > 0 && (
        <div className="recent-section">
          <h3 className="recent-title">Recently Uploaded</h3>
          <div className="files-list">
            {recentFiles.map((file) => (
              <div key={file._id} className="file-item">
                <span className="file-name">{file.filename}</span>
                <span className="file-size">{formatBytes(file.size)}</span>
                <span className="file-date">{new Date(file.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
