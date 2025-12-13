import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function ShareView() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const accessShareLink = useCallback(async (pwd = null) => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await axios.post(`${API_URL}/share/access/${token}`, {
        password: pwd
      });
      
      setFileInfo(res.data.file);
      setPermissions(res.data.permissions);
      setRequiresPassword(false);
      
      // Load preview if view permission is granted
      if (res.data.permissions.view) {
        loadPreview(pwd || password);
      }
    } catch (err) {
      if (err.response?.data?.requiresPassword) {
        setRequiresPassword(true);
      } else {
        setError(err.response?.data?.error || 'Failed to access shared file');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    accessShareLink(null);
  }, [accessShareLink]);

  const loadPreview = async (pwd) => {
    try {
      const res = await axios.post(`${API_URL}/share/preview/${token}`, 
        { password: pwd },
        { responseType: 'blob' }
      );
      
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Preview failed:', err);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    accessShareLink(password);
  };

  const handleDownload = async () => {
    if (!permissions?.download) return;
    
    setDownloading(true);
    try {
      const res = await axios.post(`${API_URL}/share/download/${token}`,
        { password },
        { responseType: 'blob' }
      );
      
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileInfo.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setDownloading(false);
    }
  };

  const renderPreview = () => {
    if (!previewUrl || !fileInfo) return null;

    const mimetype = fileInfo.mimetype || '';

    // Image preview
    if (mimetype.startsWith('image/')) {
      return <img src={previewUrl} alt={fileInfo.filename} className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg" />;
    }

    // PDF preview
    if (mimetype === 'application/pdf') {
      return <iframe src={previewUrl} className="w-full h-[60vh] rounded-lg" title={fileInfo.filename} />;
    }

    // Video preview
    if (mimetype.startsWith('video/')) {
      return <video src={previewUrl} controls className="max-w-full max-h-[60vh] rounded-lg shadow-lg" />;
    }

    // Audio preview
    if (mimetype.startsWith('audio/')) {
      return (
        <div className="w-full max-w-md p-8 bg-gray-100 rounded-lg">
          <div className="text-center mb-4">
            <svg className="mx-auto h-16 w-16 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <audio src={previewUrl} controls className="w-full" />
        </div>
      );
    }

    // Text preview
    if (mimetype.startsWith('text/') || mimetype === 'application/json') {
      return <iframe src={previewUrl} className="w-full h-[60vh] bg-white rounded-lg border" title={fileInfo.filename} />;
    }

    // Default: show file icon
    return (
      <div className="text-center p-12 bg-gray-100 rounded-lg">
        <svg className="mx-auto h-24 w-24 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <p className="mt-4 text-gray-600">Preview not available for this file type</p>
      </div>
    );
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading shared file...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="bg-red-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
            <svg className="h-10 w-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  // Password required state
  if (requiresPassword) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <div className="text-center mb-6">
            <div className="bg-purple-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <svg className="h-10 w-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Password Protected</h2>
            <p className="text-gray-600">This file is password protected. Please enter the password to access it.</p>
          </div>
          
          <form onSubmit={handlePasswordSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full border border-gray-300 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />
            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Access File
            </button>
          </form>
        </div>
      </div>
    );
  }

  // File view state
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="max-w-4xl mx-auto flex-grow p-4 w-full">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6">
          <div className="bg-gray-800 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-white/20 rounded-lg p-3">
                  <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold">{fileInfo?.filename}</h1>
                  <p className="text-white/80 text-sm">
                    {fileInfo?.category || 'File'} • {formatFileSize(fileInfo?.size)}
                  </p>
                </div>
              </div>
              
              {permissions?.download && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  {downloading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Permissions Badge */}
          <div className="px-6 py-3 bg-gray-50 border-b flex items-center space-x-4">
            <span className="text-sm text-gray-500">Permissions:</span>
            {permissions?.view && (
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                👁 View
              </span>
            )}
            {permissions?.download && (
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                ⬇ Download
              </span>
            )}
            {permissions?.edit && (
              <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-medium">
                ✏ Edit
              </span>
            )}
          </div>
        </div>

        {/* Preview Area */}
        {permissions?.view && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex justify-center items-center min-h-[300px]">
              {previewUrl ? renderPreview() : (
                <div className="text-center text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto mb-4"></div>
                  <p>Loading preview...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-auto">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-gray-300">Shared via AI Personal Cloud Storage</p>
          <p className="text-gray-500 text-sm mt-2">© 2025 All rights reserved</p>
        </div>
      </footer>
    </div>
  );
}
