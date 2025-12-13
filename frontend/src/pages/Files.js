import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api';
import { isAuthenticated } from '../utils/auth';

export default function Files() {
  const [files, setFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [shareModal, setShareModal] = useState(null);
  const [shareLink, setShareLink] = useState(null);
  const [shareSettings, setShareSettings] = useState({
    expiresIn: '24h',
    permissions: { view: true, download: false, edit: false },
    password: '',
    maxAccess: ''
  });
  const [copying, setCopying] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    client.get('/files').then(res => setFiles(res.data));
  }, [navigate]);

  const preview = async (id) => {
    try {
      const res = await client.get(`/files/download/${id}`);
      const presignedUrl = res.data.url;
      const file = files.find(f => f._id === id);
      
      setPreviewFile(file);
      setPreviewUrl(presignedUrl);
    } catch (err) {
      console.error('Preview failed:', err);
      alert('Failed to preview file. Please try again.');
    }
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewUrl(null);
  };

  const renderPreview = () => {
    if (!previewFile || !previewUrl) return null;

    const mimetype = previewFile.mimetype || '';
    
    // Image preview
    if (mimetype.startsWith('image/')) {
      return <img src={previewUrl} alt={previewFile.filename} className="max-w-full max-h-[70vh] object-contain" />;
    }
    
    // PDF preview
    if (mimetype === 'application/pdf') {
      return <iframe src={previewUrl} className="w-full h-[70vh]" title={previewFile.filename} />;
    }
    
    // Video preview
    if (mimetype.startsWith('video/')) {
      return <video src={previewUrl} controls className="max-w-full max-h-[70vh]" />;
    }
    
    // Audio preview
    if (mimetype.startsWith('audio/')) {
      return <audio src={previewUrl} controls className="w-full" />;
    }
    
    // Text preview
    if (mimetype.startsWith('text/') || mimetype === 'application/json') {
      return <iframe src={previewUrl} className="w-full h-[70vh] bg-white" title={previewFile.filename} />;
    }
    
    // Default: show link to open in new tab
    return (
      <div className="text-center p-8">
        <p className="mb-4">Preview not available for this file type.</p>
        <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-500 text-white px-4 py-2 rounded inline-block">
          Open in New Tab
        </a>
      </div>
    );
  };

  const download = async (id) => {
    try {
      const res = await client.get(`/files/download/${id}`);
      const presignedUrl = res.data.url;
      
      // Find the file to get its filename
      const file = files.find(f => f._id === id);
      const filename = file ? file.filename : 'download';
      
      // Fetch the file as a blob to enable proper download
      const response = await fetch(presignedUrl);
      const blob = await response.blob();
      
      // Create a blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download file. Please try again.');
    }
  };

  const del = async (id) => {
    const file = files.find(f => f._id === id);
    const filename = file ? file.filename : 'this file';
    
    if (window.confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      try {
        await client.delete(`/files/${id}`);
        setFiles(files.filter(f => f._id !== id));
      } catch (err) {
        console.error('Delete failed:', err);
        alert('Failed to delete file. Please try again.');
      }
    }
  };

  // Share functionality
  const openShareModal = (file) => {
    setShareModal(file);
    setShareLink(null);
    setShareSettings({
      expiresIn: '24h',
      permissions: { view: true, download: false, edit: false },
      password: '',
      maxAccess: ''
    });
  };

  const closeShareModal = () => {
    setShareModal(null);
    setShareLink(null);
  };

  const createShareLink = async () => {
    try {
      const res = await client.post('/share/create', {
        fileId: shareModal._id,
        permissions: shareSettings.permissions,
        expiresIn: shareSettings.expiresIn,
        password: shareSettings.password || null,
        maxAccess: shareSettings.maxAccess ? parseInt(shareSettings.maxAccess) : null
      });
      setShareLink(res.data.shareLink);
    } catch (err) {
      console.error('Create share link failed:', err);
      alert('Failed to create share link. Please try again.');
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const formatExpiry = (date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div>
      <h2 className="text-2xl mb-4">My Files</h2>
      <div className="grid gap-4">
        {files.map(f => (
          <div key={f._id} className="p-4 bg-white rounded shadow flex justify-between items-center">
            <div>
              <div className="font-bold">{f.filename}</div>
              <div className="text-sm text-gray-500">{f.category || 'uncategorized'} {f.duplicate ? '(duplicate)' : ''}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openShareModal(f)} className="bg-purple-500 text-white px-3 py-1 rounded">Share</button>
              <button onClick={() => preview(f._id)} className="bg-green-500 text-white px-3 py-1 rounded">Preview</button>
              <button onClick={() => download(f._id)} className="bg-blue-500 text-white px-3 py-1 rounded">Download</button>
              <button onClick={() => del(f._id)} className="bg-red-500 text-white px-3 py-1 rounded">Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={closePreview}>
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-bold">{previewFile.filename}</h3>
              <button onClick={closePreview} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
            </div>
            <div className="p-4 flex justify-center items-center">
              {renderPreview()}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => download(previewFile._id)} className="bg-blue-500 text-white px-4 py-2 rounded">Download</button>
              <button onClick={closePreview} className="bg-gray-500 text-white px-4 py-2 rounded">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={closeShareModal}>
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-bold">Share File</h3>
              <button onClick={closeShareModal} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6">
              <div className="mb-4 p-3 bg-gray-100 rounded">
                <p className="font-medium text-gray-700">{shareModal.filename}</p>
              </div>

              {!shareLink ? (
                <>
                  {/* Expiry Time */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Link Expires In</label>
                    <select
                      value={shareSettings.expiresIn}
                      onChange={(e) => setShareSettings({...shareSettings, expiresIn: e.target.value})}
                      className="w-full border border-gray-300 rounded-lg p-2"
                    >
                      <option value="1h">1 Hour</option>
                      <option value="24h">24 Hours</option>
                      <option value="7d">7 Days</option>
                      <option value="30d">30 Days</option>
                      <option value="never">Never</option>
                    </select>
                  </div>

                  {/* Permissions */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={shareSettings.permissions.view}
                          onChange={(e) => setShareSettings({
                            ...shareSettings,
                            permissions: {...shareSettings.permissions, view: e.target.checked}
                          })}
                          className="mr-2 h-4 w-4 text-purple-600"
                        />
                        <span className="text-gray-700">View</span>
                        <span className="text-gray-400 text-sm ml-2">- Allow viewing the file</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={shareSettings.permissions.download}
                          onChange={(e) => setShareSettings({
                            ...shareSettings,
                            permissions: {...shareSettings.permissions, download: e.target.checked}
                          })}
                          className="mr-2 h-4 w-4 text-purple-600"
                        />
                        <span className="text-gray-700">Download</span>
                        <span className="text-gray-400 text-sm ml-2">- Allow downloading the file</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={shareSettings.permissions.edit}
                          onChange={(e) => setShareSettings({
                            ...shareSettings,
                            permissions: {...shareSettings.permissions, edit: e.target.checked}
                          })}
                          className="mr-2 h-4 w-4 text-purple-600"
                        />
                        <span className="text-gray-700">Edit</span>
                        <span className="text-gray-400 text-sm ml-2">- Allow editing the file</span>
                      </label>
                    </div>
                  </div>

                  {/* Password Protection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password Protection (Optional)</label>
                    <input
                      type="password"
                      value={shareSettings.password}
                      onChange={(e) => setShareSettings({...shareSettings, password: e.target.value})}
                      placeholder="Enter password to protect link"
                      className="w-full border border-gray-300 rounded-lg p-2"
                    />
                  </div>

                  {/* Max Access Limit */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Max Access Count (Optional)</label>
                    <input
                      type="number"
                      value={shareSettings.maxAccess}
                      onChange={(e) => setShareSettings({...shareSettings, maxAccess: e.target.value})}
                      placeholder="Leave empty for unlimited"
                      min="1"
                      className="w-full border border-gray-300 rounded-lg p-2"
                    />
                  </div>

                  <button
                    onClick={createShareLink}
                    className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 rounded-lg transition-colors"
                  >
                    Generate Share Link
                  </button>
                </>
              ) : (
                <>
                  {/* Share Link Generated */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Share Link</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={shareLink.url}
                        readOnly
                        className="flex-1 border border-gray-300 rounded-lg p-2 bg-gray-50"
                      />
                      <button
                        onClick={() => copyToClipboard(shareLink.url)}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          copying ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                      >
                        {copying ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Expires:</span>
                      <span className="font-medium">{formatExpiry(shareLink.expiresAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Permissions:</span>
                      <span className="font-medium">
                        {[
                          shareLink.permissions.view && 'View',
                          shareLink.permissions.download && 'Download',
                          shareLink.permissions.edit && 'Edit'
                        ].filter(Boolean).join(', ')}
                      </span>
                    </div>
                    {shareLink.hasPassword && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Password Protected:</span>
                        <span className="font-medium text-green-600">Yes</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShareLink(null)}
                    className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
                  >
                    Create Another Link
                  </button>
                </>
              )}
            </div>

            <div className="p-4 border-t flex justify-end">
              <button onClick={closeShareModal} className="bg-gray-500 text-white px-4 py-2 rounded">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
