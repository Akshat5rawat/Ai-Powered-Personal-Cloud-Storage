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
  const [currentPath, setCurrentPath] = useState('/');
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showMoveModal, setShowMoveModal] = useState(null);
  const [moveTargetPath, setMoveTargetPath] = useState('/');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showDuplicateModal, setShowDuplicateModal] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [notification, setNotification] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(null);
  const [newFileName, setNewFileName] = useState('');
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

  // Folder functionality
  const createFolder = async () => {
    if (!newFolderName.trim()) {
      alert('Please enter a folder name');
      return;
    }

    try {
      await client.post('/files/folders', {
        folderName: newFolderName.trim(),
        path: currentPath
      });
      
      // Refresh files list
      const res = await client.get('/files');
      setFiles(res.data);
      
      setShowNewFolderModal(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Create folder failed:', err);
      alert(err.response?.data?.error || 'Failed to create folder. Please try again.');
    }
  };

  const openFolder = (folder) => {
    const newPath = currentPath === '/' ? `/${folder.filename}` : `${currentPath}/${folder.filename}`;
    setCurrentPath(newPath);
  };

  const navigateToPath = (path) => {
    setCurrentPath(path);
  };

  const moveFile = async (fileId) => {
    try {
      await client.put(`/files/${fileId}/move`, {
        targetPath: moveTargetPath
      });
      
      // Refresh files list
      const res = await client.get('/files');
      setFiles(res.data);
      
      setShowMoveModal(null);
      setMoveTargetPath('/');
    } catch (err) {
      console.error('Move file failed:', err);
      alert(err.response?.data?.error || 'Failed to move file. Please try again.');
    }
  };

  // Rename functionality
  const openRenameModal = (file) => {
    setShowRenameModal(file);
    setNewFileName(file.filename);
  };

  const renameFile = async () => {
    if (!newFileName.trim()) {
      alert('Please enter a new name');
      return;
    }

    try {
      await client.put(`/files/${showRenameModal._id}/rename`, {
        newName: newFileName.trim()
      });
      
      // Refresh files list
      const res = await client.get('/files');
      setFiles(res.data);
      
      showNotification(`${showRenameModal.isFolder ? 'Folder' : 'File'} renamed successfully!`, 'success');
      setShowRenameModal(null);
      setNewFileName('');
    } catch (err) {
      console.error('Rename failed:', err);
      alert(err.response?.data?.error || 'Failed to rename. Please try again.');
    }
  };

  const getAllFolders = () => {
    return files.filter(f => f.isFolder);
  };

  const getCurrentItems = () => {
    return files.filter(f => (f.path || '/') === currentPath);
  };

  const getPathParts = () => {
    if (currentPath === '/') return [];
    return currentPath.split('/').filter(p => p);
  };

  const buildPathFromParts = (parts) => {
    if (parts.length === 0) return '/';
    return '/' + parts.join('/');
  };

  // Show notification toast
  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Upload file functionality
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Check for duplicates first
      const formData = new FormData();
      formData.append('file', file);

      const duplicateCheck = await client.post('/files/check-duplicate', formData);
      
      if (duplicateCheck.data.isDuplicate) {
        // Show duplicate modal instead of alert
        setPendingUpload({ file, event });
        setShowDuplicateModal(duplicateCheck.data);
        setUploading(false);
        return;
      }

      // Upload the file with current path
      await performUpload(file, event);
    } catch (err) {
      console.error('Upload failed:', err);
      showNotification(err.response?.data?.error || 'Failed to upload file. Please try again.', 'error');
      setUploading(false);
      setUploadProgress(0);
      event.target.value = ''; // Reset file input
    }
  };

  // Perform the actual upload
  const performUpload = async (file, event) => {
    try {
      setUploading(true);
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('path', currentPath);

      const uploadRes = await client.post('/files/upload', uploadFormData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      // Refresh files list
      const res = await client.get('/files');
      setFiles(res.data);
      
      // Load thumbnail if it's an image or video
      const uploadedFile = res.data.find(f => f._id === uploadRes.data.fileId);
      if (uploadedFile && (uploadedFile.mimetype?.startsWith('image/') || uploadedFile.mimetype?.startsWith('video/'))) {
        loadThumbnail(uploadedFile._id);
      }

      showNotification('File uploaded successfully!', 'success');
    } catch (err) {
      console.error('Upload failed:', err);
      showNotification(err.response?.data?.error || 'Failed to upload file. Please try again.', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (event) event.target.value = ''; // Reset file input
    }
  };

  // Handle duplicate upload confirmation
  const handleDuplicateConfirm = async () => {
    setShowDuplicateModal(null);
    if (pendingUpload) {
      await performUpload(pendingUpload.file, pendingUpload.event);
      setPendingUpload(null);
    }
  };

  // Handle duplicate upload cancel
  const handleDuplicateCancel = () => {
    setShowDuplicateModal(null);
    if (pendingUpload?.event) {
      pendingUpload.event.target.value = ''; // Reset file input
    }
    setPendingUpload(null);
  };

  const formatExpiry = (date) => {
    return new Date(date).toLocaleString();
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
    // Handle folders
    if (file.isFolder) {
      const sizeClasses = {
        'extra-large': 'w-32 h-32 text-6xl',
        'large': 'w-24 h-24 text-5xl',
        'medium': 'w-16 h-16 text-3xl',
        'small': 'w-12 h-12 text-2xl',
        'list': 'w-8 h-8 text-xl'
      };
      const sizeClass = sizeClasses[size] || sizeClasses.medium;
      
      return (
        <div 
          className={`${sizeClass} flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity`}
          onClick={() => openFolder(file)}
        >
          <span>📁</span>
        </div>
      );
    }

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
    // Handle folder rendering
    if (file.isFolder) {
      return (
        <div key={file._id} className="p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow flex justify-between items-center cursor-pointer" onClick={() => openFolder(file)}>
          <div className="flex items-center gap-4">
            <div className="text-4xl">📁</div>
            <div>
              <div className="font-semibold text-gray-800">{file.filename}</div>
              <div className="text-sm text-gray-500">Folder</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); del(file._id); }} 
              className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      );
    }

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
                <button onClick={() => openRenameModal(file)} className="bg-yellow-500 text-white px-2 py-1 text-xs rounded hover:bg-yellow-600">Rename</button>
                <button onClick={() => setShowMoveModal(file)} className="bg-green-500 text-white px-2 py-1 text-xs rounded hover:bg-green-600">Move</button>
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
                <button onClick={() => openRenameModal(file)} className="bg-yellow-500 text-white px-2 py-1 text-xs rounded hover:bg-yellow-600">Rename</button>
                <button onClick={() => setShowMoveModal(file)} className="bg-green-500 text-white px-2 py-1 text-xs rounded hover:bg-green-600">Move</button>
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
              <button onClick={() => openRenameModal(file)} className="bg-yellow-500 text-white px-1 py-0.5 text-xs rounded hover:bg-yellow-600">Rename</button>
              <button onClick={() => setShowMoveModal(file)} className="bg-green-500 text-white px-1 py-0.5 text-xs rounded hover:bg-green-600">Move</button>
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
              <button onClick={() => openRenameModal(file)} className="bg-yellow-500 text-white px-2 py-1 text-xs rounded hover:bg-yellow-600">Rename</button>
              <button onClick={() => setShowMoveModal(file)} className="bg-green-500 text-white px-2 py-1 text-xs rounded hover:bg-green-600">Move</button>
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
              <button onClick={() => openRenameModal(file)} className="bg-yellow-500 text-white px-2 py-1 text-xs rounded hover:bg-yellow-600">Rename</button>
              <button onClick={() => setShowMoveModal(file)} className="bg-green-500 text-white px-2 py-1 text-xs rounded hover:bg-green-600">Move</button>
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
              <button onClick={() => openRenameModal(file)} className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600">Rename</button>
              <button onClick={() => setShowMoveModal(file)} className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600">Move</button>
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
      {/* Header with Breadcrumb Navigation */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <div>
            <h2 className="text-2xl font-bold">My Files</h2>
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
              <button 
                onClick={() => navigateToPath('/')}
                className="hover:text-blue-600 font-medium"
              >
                Home
              </button>
              {getPathParts().map((part, index) => (
                <React.Fragment key={index}>
                  <span>/</span>
                  <button
                    onClick={() => navigateToPath(buildPathFromParts(getPathParts().slice(0, index + 1)))}
                    className="hover:text-blue-600 font-medium"
                  >
                    {part}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFolderModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="font-medium">New Folder</span>
          </button>

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
      </div>
      
      {/* Current Folder Content */}
      <div className="space-y-4">
        {(() => {
          const currentItems = getCurrentItems();
          const folders = currentItems.filter(item => item.isFolder);
          const filesInFolder = currentItems.filter(item => !item.isFolder);
          
          // Group files by category
          const filesByCategory = filesInFolder.reduce((acc, file) => {
            const category = getCategoryFromMimetype(file.mimetype);
            if (!acc[category]) {
              acc[category] = [];
            }
            acc[category].push(file);
            return acc;
          }, {});

          const categories = ['Images', 'Videos', 'Documents', 'Audio', 'Others'];
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
            <>
              {/* Show Folders First */}
              {folders.length > 0 && (
                <div className="bg-white rounded-lg shadow-md overflow-hidden mb-4">
                  <div className="px-6 py-4 bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">📁</span>
                      <div className="text-left">
                        <h3 className="text-lg font-semibold text-gray-800">Folders</h3>
                        <p className="text-sm text-gray-500">{folders.length} {folders.length === 1 ? 'folder' : 'folders'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50">
                    <div className={gridClasses[viewMode] || gridClasses.tiles}>
                      {folders.map(f => renderFileInView(f, 'Folders'))}
                    </div>
                  </div>
                </div>
              )}

              {/* Show Files by Category */}
              {categories.map(category => {
                const categoryFiles = filesByCategory[category] || [];
                if (categoryFiles.length === 0) return null;

                const isCollapsed = collapsedFolders[category];

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
                            <div className="col-span-4">Name</div>
                            <div className="col-span-2">Date</div>
                            <div className="col-span-1">Category</div>
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

              {currentItems.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg">No files or folders in this location.</p>
                  <p className="text-sm mt-2">Upload some files or create folders to get started!</p>
                </div>
              )}
            </>
          );
        })()}
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

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowNewFolderModal(false)}>
          <div className="bg-white rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-bold">Create New Folder</h3>
              <button onClick={() => setShowNewFolderModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Folder Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                  placeholder="Enter folder name"
                  className="w-full border border-gray-300 rounded-lg p-2"
                  autoFocus
                />
              </div>

              <div className="mb-4 p-3 bg-gray-100 rounded">
                <p className="text-sm text-gray-600">
                  <strong>Location:</strong> {currentPath}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={createFolder}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Create Folder
                </button>
                <button
                  onClick={() => setShowNewFolderModal(false)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move File Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowMoveModal(null)}>
          <div className="bg-white rounded-lg max-w-md w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-bold">Move File</h3>
              <button onClick={() => setShowMoveModal(null)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6">
              <div className="mb-4 p-3 bg-gray-100 rounded">
                <p className="text-sm font-medium text-gray-700">Moving: {showMoveModal.filename}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Destination Folder</label>
                <select
                  value={moveTargetPath}
                  onChange={(e) => setMoveTargetPath(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2"
                >
                  <option value="/">Root (Home)</option>
                  {getAllFolders().map(folder => {
                    const folderPath = folder.path === '/' ? `/${folder.filename}` : `${folder.path}/${folder.filename}`;
                    return (
                      <option key={folder._id} value={folderPath}>
                        {folderPath}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => moveFile(showMoveModal._id)}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Move File
                </button>
                <button
                  onClick={() => setShowMoveModal(null)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowRenameModal(null)}>
          <div className="bg-white rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-xl font-bold">Rename {showRenameModal.isFolder ? 'Folder' : 'File'}</h3>
              <button onClick={() => setShowRenameModal(null)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6">
              <div className="mb-4 p-3 bg-gray-100 rounded">
                <p className="text-sm font-medium text-gray-700">Current name: {showRenameModal.filename}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">New Name</label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && renameFile()}
                  className="w-full border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter new name"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={renameFile}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={() => setShowRenameModal(null)}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Detection Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={handleDuplicateCancel}>
          <div className="bg-white rounded-lg max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b bg-yellow-50">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-800">Duplicate File Detected</h3>
              </div>
              <button onClick={handleDuplicateCancel} className="text-gray-500 hover:text-gray-700 text-2xl font-bold">&times;</button>
            </div>
            
            <div className="p-6">
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-gray-800 font-medium mb-2">{showDuplicateModal.message}</p>
              </div>

              {showDuplicateModal.duplicateOf && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-gray-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-1"><strong>Existing file location:</strong></p>
                      <p className="text-sm font-mono bg-white px-3 py-2 rounded border border-gray-200 text-blue-600 break-all">
                        {showDuplicateModal.duplicateOf.fullPath || 
                         (showDuplicateModal.duplicateOf.path === '/' 
                           ? `/${showDuplicateModal.duplicateOf.filename}` 
                           : `${showDuplicateModal.duplicateOf.path}/${showDuplicateModal.duplicateOf.filename}`)}
                      </p>
                    </div>
                  </div>
                  {showDuplicateModal.duplicateOf.createdAt && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 ml-7">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Uploaded: {new Date(showDuplicateModal.duplicateOf.createdAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Uploading this file will create a separate copy in <span className="font-mono font-semibold">{currentPath}</span>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDuplicateConfirm}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload Anyway
                </button>
                <button
                  onClick={handleDuplicateCancel}
                  className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-20 right-8 z-50 animate-slide-in-right">
          <div className={`rounded-lg shadow-lg p-4 max-w-md flex items-start gap-3 ${
            notification.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            {notification.type === 'success' ? (
              <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div className="flex-1">
              <p className={`font-medium ${
                notification.type === 'success' ? 'text-green-800' : 'text-red-800'
              }`}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating Upload Button (FAB) */}
      <div className="fixed bottom-8 right-8 z-40">
        <input
          type="file"
          id="file-upload-fab"
          onChange={handleFileUpload}
          className="hidden"
          disabled={uploading}
        />
        <label
          htmlFor="file-upload-fab"
          className={`flex items-center justify-center w-16 h-16 rounded-full shadow-lg cursor-pointer transition-all duration-300 ${
            uploading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 hover:shadow-2xl hover:scale-110'
          }`}
          title={uploading ? 'Uploading...' : `Upload file to ${currentPath}`}
        >
          {uploading ? (
            <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </label>
        
        {/* Upload Progress Indicator */}
        {uploading && (
          <div className="absolute -top-14 right-0 bg-white rounded-lg shadow-lg p-3 min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-blue-600 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Uploading...</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1 text-right">{uploadProgress}%</p>
          </div>
        )}
      </div>
    </div>
  );
}
