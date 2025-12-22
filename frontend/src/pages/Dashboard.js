import React, { useState, useEffect, useCallback } from 'react';
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
  const [shareStats, setShareStats] = useState({ totalShareLinks: 0, totalSharedFiles: 0, totalAccessCount: 0 });
  const [storageInsights, setStorageInsights] = useState({
    duplicateCount: 0,
    potentialSpaceSaved: 0,
    duplicateGroups: [],
    similarFiles: []
  });
  const [analytics, setAnalytics] = useState({
    fileTypes: {},
    uploadsByDay: [],
    largestFiles: [],
    categoryCounts: {},
    totalSharedFiles: 0,
    averageFileSize: 0
  });
  const navigate = useNavigate();

  // Fetch real-time share stats
  const loadShareStats = useCallback(async () => {
    try {
      const res = await client.get('/share/stats');
      setShareStats(res.data);
    } catch (err) {
      console.error('Failed to load share stats:', err);
    }
  }, []);

  // Fetch storage insights (duplicates, space saved, similar files)
  const loadStorageInsights = useCallback(async () => {
    try {
      const res = await client.get('/files/storage-insights');
      setStorageInsights(res.data);
    } catch (err) {
      console.error('Failed to load storage insights:', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    loadDashboardData();
    loadShareStats();
    loadStorageInsights();
    
    // Auto-refresh share stats every 10 seconds for real-time updates
    const interval = setInterval(loadShareStats, 10000);
    return () => clearInterval(interval);
  }, [navigate, loadShareStats, loadStorageInsights]);

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
      
      // Calculate analytics
      calculateAnalytics(files);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  };

  const calculateAnalytics = (files) => {
    // File types distribution
    const fileTypes = {};
    files.forEach(f => {
      const ext = f.filename?.split('.').pop()?.toLowerCase() || 'unknown';
      const type = getFileTypeCategory(f.mimetype, ext);
      fileTypes[type] = (fileTypes[type] || 0) + 1;
    });

    // Uploads by day (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short' });
      const count = files.filter(f => {
        const fileDate = new Date(f.createdAt);
        return fileDate.toDateString() === date.toDateString();
      }).length;
      last7Days.push({ day: dateStr, count });
    }

    // Largest files (top 5)
    const largestFiles = [...files]
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 5);

    // AI Categories
    const categoryCounts = {};
    files.forEach(f => {
      const category = f.aiCategory || 'Uncategorized';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });

    // Shared files count
    const totalSharedFiles = files.filter(f => f.shareLinks?.length > 0).length;

    // Average file size
    const averageFileSize = files.length > 0 
      ? files.reduce((sum, f) => sum + (f.size || 0), 0) / files.length 
      : 0;

    setAnalytics({
      fileTypes,
      uploadsByDay: last7Days,
      largestFiles,
      categoryCounts,
      totalSharedFiles,
      averageFileSize
    });
  };

  const getFileTypeCategory = (mimetype, ext) => {
    if (mimetype?.startsWith('image/')) return 'Images';
    if (mimetype?.startsWith('video/')) return 'Videos';
    if (mimetype?.startsWith('audio/')) return 'Audio';
    if (mimetype?.includes('pdf')) return 'PDFs';
    if (mimetype?.includes('document') || mimetype?.includes('word') || ['doc', 'docx'].includes(ext)) return 'Documents';
    if (mimetype?.includes('spreadsheet') || mimetype?.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'Spreadsheets';
    if (mimetype?.includes('zip') || mimetype?.includes('rar') || mimetype?.includes('compressed')) return 'Archives';
    return 'Other';
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

      {/* Analytics Section */}
      <div className="mb-12">
        <h3 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h3>
        
        {/* Analytics Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
            <div className="text-3xl mb-2">📊</div>
            <p className="text-sm text-gray-600 mb-1">Total Files</p>
            <p className="text-3xl font-bold text-gray-900">{stats.totalFiles}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
            <div className="text-3xl mb-2">📤</div>
            <p className="text-sm text-gray-600 mb-1">Shared Files</p>
            <p className="text-3xl font-bold text-gray-900">{shareStats.totalSharedFiles}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
            <div className="text-3xl mb-2">📏</div>
            <p className="text-sm text-gray-600 mb-1">Avg File Size</p>
            <p className="text-3xl font-bold text-gray-900">{formatBytes(analytics.averageFileSize)}</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
            <div className="text-3xl mb-2">📂</div>
            <p className="text-sm text-gray-600 mb-1">File Types</p>
            <p className="text-3xl font-bold text-gray-900">{Object.keys(analytics.fileTypes).length}</p>
          </div>
        </div>

        {/* File Types & Upload Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* File Types Distribution */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>📁</span> File Types
            </h4>
            <div className="space-y-4">
              {Object.entries(analytics.fileTypes).length > 0 ? (
                Object.entries(analytics.fileTypes)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const percent = stats.totalFiles > 0 ? (count / stats.totalFiles) * 100 : 0;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{type}</span>
                          <span className="text-gray-500">{count} files ({Math.round(percent)}%)</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p className="text-gray-500 text-center py-4">No files uploaded yet</p>
              )}
            </div>
          </div>

          {/* Upload Activity (Last 7 Days) */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>📈</span> Upload Activity (Last 7 Days)
            </h4>
            <div className="flex items-end justify-between gap-2 h-40">
              {analytics.uploadsByDay.map((day, index) => {
                const maxCount = Math.max(...analytics.uploadsByDay.map(d => d.count), 1);
                const height = day.count > 0 ? (day.count / maxCount) * 100 : 5;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex flex-col items-center justify-end h-32">
                      <span className="text-xs font-semibold text-gray-700 mb-1">{day.count}</span>
                      <div 
                        className="w-full bg-gradient-to-t from-purple-500 to-pink-400 rounded-t-lg transition-all duration-500 hover:from-purple-600 hover:to-pink-500"
                        style={{ height: `${height}%`, minHeight: day.count > 0 ? '8px' : '4px' }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500">{day.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Storage Insights & Duplication */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Storage & Duplication Insights */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>🔍</span> Storage & Duplication Insights
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-orange-50 rounded-xl border border-red-100">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div>
                    <p className="font-medium text-gray-800">Duplicates Detected</p>
                    <p className="text-sm text-gray-500">Files with identical content</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-red-600">{storageInsights.duplicateCount}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💰</span>
                  <div>
                    <p className="font-medium text-gray-800">Storage Saved</p>
                    <p className="text-sm text-gray-500">By removing duplicates</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-green-600">{formatBytes(storageInsights.potentialSpaceSaved)}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <p className="font-medium text-gray-800">Total Storage</p>
                    <p className="text-sm text-gray-500">All files combined</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-purple-600">{formatBytes(stats.totalSize)}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔗</span>
                  <div>
                    <p className="font-medium text-gray-800">Similar Files</p>
                    <p className="text-sm text-gray-500">Files with similar names</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-blue-600">{storageInsights.similarFiles?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* Duplicate Files List */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>📋</span> Duplicate Groups
            </h4>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {storageInsights.duplicateGroups?.length > 0 ? (
                storageInsights.duplicateGroups.map((group, index) => (
                  <div 
                    key={index} 
                    className="p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl border border-orange-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700">Original:</span>
                      <span className="text-xs text-green-600 font-medium bg-green-100 px-2 py-0.5 rounded-full">
                        {formatBytes(group.spaceSaved)} saveable
                      </span>
                    </div>
                    <p className="font-medium text-gray-900 truncate text-sm mb-2">{group.original?.filename}</p>
                    <div className="pl-3 border-l-2 border-orange-300">
                      <p className="text-xs text-gray-500 mb-1">Duplicates ({group.duplicates?.length}):</p>
                      {group.duplicates?.slice(0, 3).map((dup, i) => (
                        <p key={i} className="text-sm text-gray-600 truncate">{dup.filename}</p>
                      ))}
                      {group.duplicates?.length > 3 && (
                        <p className="text-xs text-gray-400">+{group.duplicates.length - 3} more</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <span className="text-4xl mb-2 block">✨</span>
                  <p className="text-gray-500">No duplicates found!</p>
                  <p className="text-sm text-gray-400">Your storage is optimized</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Similar Files */}
        {storageInsights.similarFiles?.length > 0 && (
          <div className="mt-8 bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>🔗</span> Similar Files (By Name)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {storageInsights.similarFiles.slice(0, 6).map((pair, index) => (
                <div 
                  key={index}
                  className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {pair.reason}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-gray-700 truncate">📄 {pair.file1?.filename}</p>
                    <p className="text-sm text-gray-700 truncate">📄 {pair.file2?.filename}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Storage Insights & Largest Files */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {/* Storage Stats */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>💾</span> Storage Stats
            </h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📈</span>
                  <div>
                    <p className="font-medium text-gray-800">Avg File Size</p>
                    <p className="text-sm text-gray-500">Per file average</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-purple-600">{formatBytes(analytics.averageFileSize)}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔗</span>
                  <div>
                    <p className="font-medium text-gray-800">Shared Files</p>
                    <p className="text-sm text-gray-500">{shareStats.totalShareLinks} active links</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-green-600">{shareStats.totalSharedFiles}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📁</span>
                  <div>
                    <p className="font-medium text-gray-800">File Types</p>
                    <p className="text-sm text-gray-500">Different formats</p>
                  </div>
                </div>
                <span className="text-xl font-bold text-orange-600">{Object.keys(analytics.fileTypes).length}</span>
              </div>
            </div>
          </div>

          {/* Largest Files */}
          <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-100">
            <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <span>📦</span> Largest Files
            </h4>
            <div className="space-y-3">
              {analytics.largestFiles.length > 0 ? (
                analytics.largestFiles.map((file, index) => (
                  <div 
                    key={file._id} 
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <span className="w-6 h-6 flex items-center justify-center bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded-full">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{file.filename}</p>
                    </div>
                    <span className="text-sm font-semibold text-purple-600">{formatBytes(file.size)}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">No files uploaded yet</p>
              )}
            </div>
          </div>
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
