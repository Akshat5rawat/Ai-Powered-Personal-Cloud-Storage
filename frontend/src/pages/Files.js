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
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [thumbnails, setThumbnails] = useState({});
  const [viewMode, setViewMode] = useState('tiles');
  const [showViewMenu, setShowViewMenu] = useState(false);
  // Summary modal state
  const [summaryModal, setSummaryModal] = useState(null);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    client.get('/files').then(res => {
      setFiles(res.data);
      // Load thumbnails for images and videos
      res.data.forEach(file => {
        if (file.mimetype?.startsWith('image/') || file.mimetype?.startsWith('video/')) {
          loadThumbnail(file._id);
        }
      });
    });
  }, [navigate]);

  const loadThumbnail = async (fileId) => {
    try {
      const res = await client.get(`/files/download/${fileId}`);
      setThumbnails(prev => ({
        ...prev,
        [fileId]: res.data.url
      }));
    } catch (err) {
      console.error('Failed to load thumbnail:', err);
    }
  };

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
    
    // Word document preview (.doc, .docx)
    if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        mimetype === 'application/msword') {
      const encodedUrl = encodeURIComponent(previewUrl);
      return (
        <iframe 
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`}
          className="w-full h-[70vh]" 
          title={previewFile.filename}
        />
      );
    }
    
    // PowerPoint presentation preview (.ppt, .pptx)
    if (mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || 
        mimetype === 'application/vnd.ms-powerpoint') {
      const encodedUrl = encodeURIComponent(previewUrl);
      return (
        <iframe 
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`}
          className="w-full h-[70vh]" 
          title={previewFile.filename}
        />
      );
    }
    
    // Excel spreadsheet preview (.xls, .xlsx)
    if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        mimetype === 'application/vnd.ms-excel') {
      const encodedUrl = encodeURIComponent(previewUrl);
      return (
        <iframe 
          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`}
          className="w-full h-[70vh]" 
          title={previewFile.filename}
        />
      );
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
      
      // Trigger notification for download started
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: `Downloading: "${filename}"` }
      }));
      
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
        
        // Trigger notification for file deleted
        window.dispatchEvent(new CustomEvent('app-notification', {
          detail: { message: `File deleted: "${filename}"` }
        }));
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
      
      // Trigger notification for share link created
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: `Share link created for "${shareModal.filename}"` }
      }));
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
      
      // Trigger notification for link copied
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: 'Share link copied to clipboard!' }
      }));
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const formatExpiry = (date) => {
    return new Date(date).toLocaleString();
  };

  // Summary functionality
  const isSummarizable = (mimetype) => {
    if (!mimetype) return false;
    const summarizable = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp'
    ];
    return summarizable.some(s => mimetype.toLowerCase().includes(s));
  };

  const openSummaryModal = async (file) => {
    setSummaryModal(file);
    setSummaryData(null);
    setSummaryError(null);
    setSummaryLoading(true);

    try {
      // First check if summary already exists
      const res = await client.get(`/ai/summary/${file._id}`);
      if (res.data.summary && res.data.summaryStatus === 'completed') {
        setSummaryData(res.data);
        setSummaryLoading(false);
      } else {
        // Generate new summary
        await generateSummary(file._id);
      }
    } catch (err) {
      console.error('Failed to get summary:', err);
      setSummaryError('Failed to load summary. Please try again.');
      setSummaryLoading(false);
    }
  };

  const generateSummary = async (fileId) => {
    setSummaryLoading(true);
    setSummaryError(null);

    try {
      const res = await client.post(`/ai/summarize/${fileId}`);
      setSummaryData(res.data);
      
      // Update file in state with new summary info
      setFiles(prevFiles => prevFiles.map(f => 
        f._id === fileId 
          ? { ...f, summary: res.data.summary, summaryStatus: res.data.status }
          : f
      ));
      
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: `Summary generated for "${summaryModal?.filename || 'file'}"` }
      }));
    } catch (err) {
      console.error('Failed to generate summary:', err);
      setSummaryError(err.response?.data?.message || err.response?.data?.error || 'Failed to generate summary. Please try again.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const closeSummaryModal = () => {
    setSummaryModal(null);
    setSummaryData(null);
    setSummaryError(null);
  };

  const formatUploadDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} • ${timeStr}`;
  };

  const getCategoryFromMimetype = (mimetype) => {
    if (!mimetype) return 'Others';
    if (mimetype.startsWith('image/')) return 'Images';
    if (mimetype.startsWith('video/')) return 'Videos';
    if (mimetype.startsWith('audio/')) return 'Audio';
    if (mimetype === 'application/pdf' || 
        mimetype.startsWith('application/msword') ||
        mimetype.startsWith('application/vnd.openxmlformats-officedocument') ||
        mimetype.startsWith('text/')) return 'Documents';
    return 'Others';
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'Images': '📷',
      'Videos': '🎥',
      'Documents': '📄',
      'Audio': '🎵',
      'Others': '📦'
    };
    return icons[category] || '📁';
  };

  const toggleFolder = (category) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Group files by category
  const filesByCategory = files.reduce((acc, file) => {
    const category = getCategoryFromMimetype(file.mimetype);
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(file);
    return acc;
  }, {});

  const categories = ['Images', 'Videos', 'Documents', 'Audio', 'Others'];

  const renderFileThumbnail = (file, category, size = 'medium') => {
    const thumbnailUrl = thumbnails[file._id];
    const sizeClasses = {
      'extra-large': 'w-32 h-32',
      'large': 'w-24 h-24',
      'medium': 'w-16 h-16',
      'small': 'w-12 h-12',
      'list': 'w-8 h-8'
    };
    const iconSizes = {
      'extra-large': 'text-6xl',
      'large': 'text-5xl',
      'medium': 'text-3xl',
      'small': 'text-2xl',
      'list': 'text-xl'
    };

    const sizeClass = sizeClasses[size] || sizeClasses.medium;
    const iconSize = iconSizes[size] || iconSizes.medium;

    // Image thumbnail
    if (category === 'Images' && thumbnailUrl) {
      return (
        <img 
          src={thumbnailUrl} 
          alt={file.filename}
          className={`${sizeClass} object-cover rounded border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity`}
          onClick={() => preview(file._id)}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      );
    }

    // Video thumbnail
    if (category === 'Videos' && thumbnailUrl) {
      return (
        <div className={`relative ${sizeClass} cursor-pointer hover:opacity-80 transition-opacity`} onClick={() => preview(file._id)}>
          <video 
            src={thumbnailUrl} 
            className="w-full h-full object-cover rounded border border-gray-200"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black bg-opacity-50 rounded-full p-1">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
        </div>
      );
    }

    // Default icon for other types
    return (
      <div className={`${sizeClass} flex items-center justify-center bg-gray-100 rounded border border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors`} onClick={() => preview(file._id)}>
        <span className={iconSize}>{getCategoryIcon(category)}</span>
      </div>
    );
  };

  const renderFileInView = (file, category) => {
    switch (viewMode) {
      case 'extra-large':
        return (
          <div key={file._id} className="flex flex-col items-center p-4 bg-white rounded-lg hover:bg-gray-50">
            <div className="relative">
              {renderFileThumbnail(file, category, 'extra-large')}
            </div>
            <div className="mt-2 text-center w-full">
              <p className="text-sm font-medium truncate cursor-pointer hover:text-blue-600" title={file.filename} onClick={() => preview(file._id)}>{file.filename}</p>
              <p className="text-xs text-gray-500 mt-1">{formatUploadDate(file.createdAt)}</p>
              <div className="flex gap-2 mt-2 justify-center flex-wrap">
                {isSummarizable(file.mimetype) && (
                  <button onClick={() => openSummaryModal(file)} className="bg-emerald-500 text-white px-2 py-1 text-xs rounded hover:bg-emerald-600" title="View AI Summary">📋</button>
                )}
                <button onClick={() => openShareModal(file)} className="bg-purple-500 text-white px-2 py-1 text-xs rounded hover:bg-purple-600">Share</button>
                <button onClick={() => download(file._id)} className="bg-blue-500 text-white px-2 py-1 text-xs rounded hover:bg-blue-600">Download</button>
                <button onClick={(e) => { e.stopPropagation(); del(file._id); }} className="bg-red-500 text-white px-2 py-1 text-xs rounded hover:bg-red-600">Delete</button>
              </div>
            </div>
          </div>
        );

      case 'large':
        return (
          <div key={file._id} className="flex flex-col items-center p-3 bg-white rounded-lg hover:bg-gray-50">
            <div className="relative">
              {renderFileThumbnail(file, category, 'large')}
            </div>
            <div className="mt-2 text-center w-full">
              <p className="text-sm font-medium truncate cursor-pointer hover:text-blue-600" title={file.filename} onClick={() => preview(file._id)}>{file.filename}</p>
              <p className="text-xs text-gray-500 mt-1">{formatUploadDate(file.createdAt)}</p>
              <div className="flex gap-1 mt-2 justify-center flex-wrap">
                {isSummarizable(file.mimetype) && (
                  <button onClick={() => openSummaryModal(file)} className="bg-emerald-500 text-white px-2 py-1 text-xs rounded hover:bg-emerald-600" title="View AI Summary">📋</button>
                )}
                <button onClick={() => openShareModal(file)} className="bg-purple-500 text-white px-2 py-1 text-xs rounded hover:bg-purple-600">Share</button>
                <button onClick={() => download(file._id)} className="bg-blue-500 text-white px-2 py-1 text-xs rounded hover:bg-blue-600">Download</button>
                <button onClick={(e) => { e.stopPropagation(); del(file._id); }} className="bg-red-500 text-white px-2 py-1 text-xs rounded hover:bg-red-600">Delete</button>
              </div>
            </div>
          </div>
        );

      case 'medium':
        return (
          <div key={file._id} className="flex flex-col items-center p-2 bg-white rounded-lg hover:bg-gray-50">
            <div className="relative">
              {renderFileThumbnail(file, category, 'medium')}
            </div>
            <p className="text-xs mt-1 truncate w-full text-center cursor-pointer hover:text-blue-600" title={file.filename} onClick={() => preview(file._id)}>{file.filename}</p>
            <p className="text-xs text-gray-500 mt-0.5">{file.createdAt ? new Date(file.createdAt).toLocaleDateString() : ''}</p>
            <div className="flex gap-1 mt-1 flex-wrap justify-center">
              {isSummarizable(file.mimetype) && (
                <button onClick={() => openSummaryModal(file)} className="bg-emerald-500 text-white px-1 py-0.5 text-xs rounded hover:bg-emerald-600" title="View AI Summary">📋</button>
              )}
              <button onClick={() => openShareModal(file)} className="bg-purple-500 text-white px-1 py-0.5 text-xs rounded hover:bg-purple-600">Share</button>
              <button onClick={() => download(file._id)} className="bg-blue-500 text-white px-1 py-0.5 text-xs rounded hover:bg-blue-600">Download</button>
              <button onClick={(e) => { e.stopPropagation(); del(file._id); }} className="bg-red-500 text-white px-1 py-0.5 text-xs rounded hover:bg-red-600">Delete</button>
            </div>
          </div>
        );

      case 'small':
        return (
          <div key={file._id} className="flex flex-col items-center p-2 bg-white rounded hover:bg-gray-50 cursor-pointer" onClick={() => preview(file._id)}>
            {renderFileThumbnail(file, category, 'small')}
            <p className="text-xs mt-1 truncate w-16 text-center hover:text-blue-600" title={file.filename}>{file.filename}</p>
          </div>
        );

      case 'list':
        return (
          <div key={file._id} className="flex items-center gap-3 p-2 bg-white hover:bg-gray-50 rounded">
            {renderFileThumbnail(file, category, 'list')}
            <span className="text-sm flex-1 truncate cursor-pointer hover:text-blue-600" onClick={() => preview(file._id)}>{file.filename}</span>
            <span className="text-sm text-gray-600 font-medium whitespace-nowrap">{formatUploadDate(file.createdAt)}</span>
            <div className="flex gap-1">
              {isSummarizable(file.mimetype) && (
                <button onClick={() => openSummaryModal(file)} className="bg-emerald-500 text-white px-2 py-1 text-xs rounded hover:bg-emerald-600" title="View AI Summary">📋</button>
              )}
              <button onClick={() => openShareModal(file)} className="bg-purple-500 text-white px-2 py-1 text-xs rounded hover:bg-purple-600">Share</button>
              <button onClick={() => download(file._id)} className="bg-blue-500 text-white px-2 py-1 text-xs rounded hover:bg-blue-600">Download</button>
              <button onClick={(e) => { e.stopPropagation(); del(file._id); }} className="bg-red-500 text-white px-2 py-1 text-xs rounded hover:bg-red-600">Delete</button>
            </div>
          </div>
        );

      case 'details':
        return (
          <div key={file._id} className="grid grid-cols-12 gap-4 p-3 bg-white hover:bg-gray-50 items-center border-b border-gray-200">
            <div className="col-span-4 flex items-center gap-3">
              {renderFileThumbnail(file, category, 'small')}
              <span className="text-sm truncate cursor-pointer hover:text-blue-600" onClick={() => preview(file._id)}>{file.filename}</span>
            </div>
            <div className="col-span-2 text-sm font-medium text-gray-700">{formatUploadDate(file.createdAt)}</div>
            <div className="col-span-1 text-sm text-gray-600">{file.category || 'uncategorized'}</div>
            <div className="col-span-1 text-sm text-gray-600">{file.duplicate ? 'Yes' : 'No'}</div>
            <div className="col-span-4 flex gap-1 justify-end">
              {isSummarizable(file.mimetype) && (
                <button onClick={() => openSummaryModal(file)} className="bg-emerald-500 text-white px-2 py-1 text-xs rounded hover:bg-emerald-600" title="View AI Summary">📋</button>
              )}
              <button onClick={() => openShareModal(file)} className="bg-purple-500 text-white px-2 py-1 text-xs rounded hover:bg-purple-600">Share</button>
              <button onClick={() => download(file._id)} className="bg-blue-500 text-white px-2 py-1 text-xs rounded hover:bg-blue-600">Download</button>
              <button onClick={(e) => { e.stopPropagation(); del(file._id); }} className="bg-red-500 text-white px-2 py-1 text-xs rounded hover:bg-red-600">Delete</button>
            </div>
          </div>
        );

      case 'tiles':
      default:
        return (
          <div key={file._id} className="p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="relative">
                {renderFileThumbnail(file, category, 'medium')}
              </div>
              <div>
                <div className="font-semibold text-gray-800 cursor-pointer hover:text-blue-600" onClick={() => preview(file._id)}>{file.filename}</div>
                <div className="text-sm text-gray-500">
                  {file.category || 'uncategorized'} {file.duplicate ? '(duplicate)' : ''}
                </div>
                <div className="text-sm text-gray-600 font-medium mt-1">
                  {formatUploadDate(file.createdAt)}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {isSummarizable(file.mimetype) && (
                <button onClick={() => openSummaryModal(file)} className="bg-emerald-500 text-white px-3 py-1 rounded hover:bg-emerald-600" title="View AI Summary">
                  {file.summaryStatus === 'completed' ? '📋 Summary' : '🤖 Summarize'}
                </button>
              )}
              <button onClick={() => openShareModal(file)} className="bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600">Share</button>
              <button onClick={() => download(file._id)} className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">Download</button>
              <button onClick={(e) => { e.stopPropagation(); del(file._id); }} className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">Delete</button>
            </div>
          </div>
        );
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <h2 className="text-2xl font-bold">My Files</h2>
        </div>

        {/* View Mode Selector */}
        <div className="relative">
          <button
            onClick={() => setShowViewMenu(!showViewMenu)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="text-sm font-medium">View</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showViewMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              <div className="py-1">
                <button
                  onClick={() => { setViewMode('extra-large'); setShowViewMenu(false); }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${viewMode === 'extra-large' ? 'bg-gray-100' : ''}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" strokeWidth={2} />
                    <rect x="14" y="3" width="7" height="7" strokeWidth={2} />
                    <rect x="3" y="14" width="7" height="7" strokeWidth={2} />
                    <rect x="14" y="14" width="7" height="7" strokeWidth={2} />
                  </svg>
                  <span className="text-sm">Extra large icons</span>
                </button>
                <button
                  onClick={() => { setViewMode('large'); setShowViewMenu(false); }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${viewMode === 'large' ? 'bg-gray-100' : ''}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="4" y="4" width="6" height="6" strokeWidth={2} />
                    <rect x="14" y="4" width="6" height="6" strokeWidth={2} />
                    <rect x="4" y="14" width="6" height="6" strokeWidth={2} />
                    <rect x="14" y="14" width="6" height="6" strokeWidth={2} />
                  </svg>
                  <span className="text-sm">Large icons</span>
                </button>
                <button
                  onClick={() => { setViewMode('medium'); setShowViewMenu(false); }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${viewMode === 'medium' ? 'bg-gray-100' : ''}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="5" y="5" width="4" height="4" strokeWidth={2} />
                    <rect x="12" y="5" width="4" height="4" strokeWidth={2} />
                    <rect x="19" y="5" width="2" height="2" strokeWidth={2} />
                    <rect x="5" y="12" width="4" height="4" strokeWidth={2} />
                    <rect x="12" y="12" width="4" height="4" strokeWidth={2} />
                    <rect x="5" y="19" width="4" height="4" strokeWidth={2} />
                  </svg>
                  <span className="text-sm">Medium icons</span>
                </button>
                <button
                  onClick={() => { setViewMode('small'); setShowViewMenu(false); }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${viewMode === 'small' ? 'bg-gray-100' : ''}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="6" cy="6" r="2" strokeWidth={2} />
                    <circle cx="12" cy="6" r="2" strokeWidth={2} />
                    <circle cx="18" cy="6" r="2" strokeWidth={2} />
                    <circle cx="6" cy="12" r="2" strokeWidth={2} />
                    <circle cx="12" cy="12" r="2" strokeWidth={2} />
                    <circle cx="18" cy="12" r="2" strokeWidth={2} />
                  </svg>
                  <span className="text-sm">Small icons</span>
                </button>
                <button
                  onClick={() => { setViewMode('list'); setShowViewMenu(false); }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${viewMode === 'list' ? 'bg-gray-100' : ''}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span className="text-sm">List</span>
                </button>
                <button
                  onClick={() => { setViewMode('details'); setShowViewMenu(false); }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${viewMode === 'details' ? 'bg-gray-100' : ''}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span className="text-sm">Details</span>
                </button>
                <button
                  onClick={() => { setViewMode('tiles'); setShowViewMenu(false); }}
                  className={`w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-100 ${viewMode === 'tiles' ? 'bg-gray-100' : ''}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="8" height="8" strokeWidth={2} />
                    <rect x="3" y="13" width="8" height="8" strokeWidth={2} />
                    <rect x="13" y="3" width="8" height="8" strokeWidth={2} />
                    <rect x="13" y="13" width="8" height="8" strokeWidth={2} />
                  </svg>
                  <span className="text-sm">Tiles</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Category Folders */}
      <div className="space-y-4">
        {categories.map(category => {
          const categoryFiles = filesByCategory[category] || [];
          if (categoryFiles.length === 0) return null;

          const isCollapsed = collapsedFolders[category];

          const gridClasses = {
            'extra-large': 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
            'large': 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3',
            'medium': 'grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3',
            'small': 'grid grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2',
            'list': 'space-y-1',
            'details': 'space-y-0',
            'tiles': 'space-y-3'
          };

          return (
            <div key={category} className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Folder Header */}
              <button
                onClick={() => toggleFolder(category)}
                className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{getCategoryIcon(category)}</span>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-gray-800">{category}</h3>
                    <p className="text-sm text-gray-500">{categoryFiles.length} {categoryFiles.length === 1 ? 'file' : 'files'}</p>
                  </div>
                </div>
                <svg
                  className={`w-6 h-6 text-gray-600 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Folder Content */}
              {!isCollapsed && (
                <div className="p-4 bg-gray-50">
                  {viewMode === 'details' && (
                    <div className="grid grid-cols-12 gap-4 p-3 bg-white font-semibold text-sm text-gray-700 border-b-2 border-gray-300 mb-2">
                      <div className="col-span-5">Name</div>
                      <div className="col-span-2">Category</div>
                      <div className="col-span-1">Duplicate</div>
                      <div className="col-span-4 text-right">Actions</div>
                    </div>
                  )}
                  <div className={gridClasses[viewMode] || gridClasses.tiles}>
                    {categoryFiles.map(f => renderFileInView(f, category))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {files.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No files uploaded yet.</p>
            <p className="text-sm mt-2">Upload some files to see them organized by category here!</p>
          </div>
        )}
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

      {/* Summary Modal */}
      {summaryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={closeSummaryModal}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🤖</span>
                <h3 className="text-xl font-bold text-gray-800">AI Summary</h3>
              </div>
              <button onClick={closeSummaryModal} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6">
              {/* File Info */}
              <div className="mb-4 p-3 bg-gray-100 rounded-lg flex items-center gap-3">
                <span className="text-2xl">{getCategoryIcon(getCategoryFromMimetype(summaryModal.mimetype))}</span>
                <div>
                  <p className="font-medium text-gray-700">{summaryModal.filename}</p>
                  <p className="text-sm text-gray-500">{summaryModal.mimetype}</p>
                </div>
              </div>

              {/* Loading State */}
              {summaryLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
                  <p className="text-gray-600 font-medium">Generating AI Summary...</p>
                  <p className="text-sm text-gray-400 mt-2">This may take a few moments for large files</p>
                </div>
              )}

              {/* Error State */}
              {summaryError && !summaryLoading && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-red-700 mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">Error</span>
                  </div>
                  <p className="text-red-600 text-sm">{summaryError}</p>
                  <button
                    onClick={() => generateSummary(summaryModal._id)}
                    className="mt-3 bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Summary Content */}
              {summaryData && !summaryLoading && (
                <div className="space-y-4">
                  {/* Summary Status Badge */}
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      summaryData.status === 'completed' || summaryData.status === 'already_summarized'
                        ? 'bg-green-100 text-green-700' 
                        : summaryData.status === 'unsupported'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {summaryData.status === 'completed' ? '✓ Generated' : 
                       summaryData.status === 'already_summarized' ? '✓ Cached' :
                       summaryData.status === 'unsupported' ? '⚠ Unsupported' : 
                       summaryData.status}
                    </span>
                    {summaryData.generatedAt && (
                      <span className="text-xs text-gray-400">
                        Generated: {new Date(summaryData.generatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Summary Text */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-5 border border-emerald-100">
                    <h4 className="text-sm font-semibold text-emerald-800 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Summary
                    </h4>
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {summaryData.summary || summaryData.message || 'No summary available.'}
                    </p>
                  </div>

                  {/* Regenerate Button */}
                  {(summaryData.status === 'completed' || summaryData.status === 'already_summarized') && (
                    <button
                      onClick={() => generateSummary(summaryModal._id)}
                      className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Regenerate Summary
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              {summaryData?.summary && (
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(summaryData.summary);
                    window.dispatchEvent(new CustomEvent('app-notification', {
                      detail: { message: `Summary copied to clipboard for "${summaryModal?.filename || 'file'}"` }
                    }));
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded transition-colors"
                >
                  Copy Summary
                </button>
              )}
              <button onClick={closeSummaryModal} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
