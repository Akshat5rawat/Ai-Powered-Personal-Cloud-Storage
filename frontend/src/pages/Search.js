import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api';
import { isAuthenticated } from '../utils/auth';

export default function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);
  const doSearch = async (e) => {
    e.preventDefault();
    try {
      const res = await client.post('/search', { q });
      setResults(res.data.results);
    } catch (err) {
      alert('Search failed');
    }
  };

  const loadThumbnail = useCallback(async (fileId) => {
    try {
      const res = await client.get(`/files/download/${fileId}`);
      if (res?.data?.url) {
        setThumbnails(prev => ({ ...prev, [fileId]: res.data.url }));
      }
    } catch (err) {
      // ignore thumbnail load errors
    }
  }, []);

  useEffect(() => {
    // load thumbnails for visible results
    results.forEach(r => {
      const file = r.file || r;
      if (!file) return;
      if ((file.mimetype || '').startsWith('image/') || (file.mimetype || '').startsWith('video/')) {
        if (!thumbnails[file._id]) loadThumbnail(file._id);
      }
    });
  }, [results, loadThumbnail, thumbnails]);

  const openPreview = async (file) => {
    setPreviewFile(file);
    setPreviewLoading(true);
    try {
      const res = await client.get(`/files/download/${file._id}`);
      if (res?.data?.url) {
        setPreviewUrl(res.data.url);
      }
    } catch (err) {
      console.error('Preview load failed', err);
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
  };

  const doKeyword = async (e) => {
    e.preventDefault();
    try {
      const res = await client.post('/search/keyword', { q });
      setResults(res.data.results.map(r => ({ file: r, score: 0 }))); // map to same format
    } catch (err) {
      alert('Keyword search failed');
    }
  };

  return (
    <div>
      <h2 className="text-2xl mb-4">Search</h2>
      <form onSubmit={doSearch} className="mb-4">
        <input value={q} onChange={e => setQ(e.target.value)} className="border p-2 w-full" placeholder="Search your files" />
        <div className="flex gap-2 mt-2">
          <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={doSearch}>Semantic</button>
          <button className="bg-gray-500 text-white px-4 py-2 rounded" onClick={doKeyword}>Keyword</button>
        </div>
      </form>
      <div className="grid gap-4">
        {results.map(r => {
          const file = r.file || r;
          const thumb = thumbnails[file._id];
          return (
            <div key={file._id} className="p-4 bg-white rounded shadow flex justify-between items-center">
              <div className="flex items-center gap-4">
                {thumb ? (
                  (file.mimetype || '').startsWith('image/') ? (
                    <img src={thumb} alt={file.filename} className="w-16 h-16 object-cover rounded cursor-pointer" onClick={() => openPreview(file)} />
                  ) : (
                    <video src={thumb} className="w-16 h-16 object-cover rounded cursor-pointer" onClick={() => openPreview(file)} />
                  )
                ) : (
                  <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-2xl">📄</div>
                )}
                <div>
                  <div className="font-bold cursor-pointer hover:text-blue-600" onClick={() => openPreview(file)}>{file.filename}</div>
                  <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="font-mono">{file.path || '/'}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Score: {(r.score || 0).toFixed(3)}</div>
                </div>
              </div>
              <div className="text-sm text-gray-600">{file.category}</div>
            </div>
          );
        })}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={closePreview}>
          <div className="bg-white rounded-lg max-w-3xl w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">{previewFile.filename}</h3>
              <button onClick={closePreview} className="text-gray-600 hover:text-gray-900">Close</button>
            </div>
            <div className="min-h-[200px] flex items-center justify-center">
              {previewLoading ? (
                <div>Loading preview...</div>
              ) : previewUrl ? (
                (previewFile.mimetype || '').startsWith('image/') ? (
                  <img src={previewUrl} alt={previewFile.filename} className="max-w-full max-h-[70vh] object-contain" />
                ) : (previewFile.mimetype || '').startsWith('video/') ? (
                  <video src={previewUrl} controls className="max-w-full max-h-[70vh]" />
                ) : (
                  <iframe src={previewUrl} className="w-full h-[60vh]" title={previewFile.filename} />
                )
              ) : (
                <div className="text-gray-500">Preview not available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
