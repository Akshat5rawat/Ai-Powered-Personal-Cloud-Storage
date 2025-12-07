import React, { useEffect, useState } from 'react';
import client from '../api';

export default function Files() {
  const [files, setFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  useEffect(() => {
    client.get('/files').then(res => setFiles(res.data));
  }, []);

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
    </div>
  );
}
