import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api';
import { isAuthenticated } from '../utils/auth';

export default function Upload() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [completedUploads, setCompletedUploads] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handle = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      alert('Please select at least one file');
      return;
    }

    setUploading(true);
    setCompletedUploads([]);
    const progressMap = {};
    
    try {
      // Upload files sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const form = new FormData();
        form.append('file', file);
        
        try {
          await client.post('/files/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              progressMap[i] = percentCompleted;
              setUploadProgress({ ...progressMap });
            }
          });
          
          setCompletedUploads(prev => [...prev, i]);
          progressMap[i] = 100;
          setUploadProgress({ ...progressMap });
          
        } catch (err) {
          alert(`Failed to upload ${file.name}: ${err.response?.data?.message || err.message}`);
        }
      }
      
      // Clear after 2 seconds
      setTimeout(() => {
        setFiles([]);
        setUploadProgress({});
        setCompletedUploads([]);
      }, 2000);
      
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white p-8 rounded-lg shadow-lg">
        <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">Upload File</h2>
        
        <form onSubmit={handle} className="space-y-6">
          {/* Drag and Drop Area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all ${
              dragActive 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              onChange={handleFileChange}
              className="hidden"
              multiple
            />
            
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="space-y-4">
                <svg
                  className="mx-auto h-16 w-16 text-gray-400"
                  stroke="currentColor"
                  fill="none"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                >
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                
                <div className="text-gray-600">
                  <span className="font-semibold text-blue-600 hover:text-blue-500">
                    Click to upload
                  </span>
                  {' '}or drag and drop
                </div>
                
                <p className="text-xs text-gray-500">
                  Any file type supported • Multiple files allowed
                </p>
              </div>
            </label>
          </div>

          {/* Selected Files List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-700">
                  Selected Files ({files.length})
                </h3>
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {files.map((file, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1">
                      <svg
                        className="h-10 w-10 text-blue-500 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {completedUploads.includes(index) && (
                        <svg className="h-6 w-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      {!uploading && !completedUploads.includes(index) && (
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar for each file */}
                  {uploading && uploadProgress[index] !== undefined && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600">
                          {completedUploads.includes(index) ? 'Completed' : 'Uploading...'}
                        </span>
                        <span className="font-medium text-blue-600">{uploadProgress[index]}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            completedUploads.includes(index) ? 'bg-green-500' : 'bg-blue-600'
                          }`}
                          style={{ width: `${uploadProgress[index]}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          <button
            type="submit"
            disabled={files.length === 0 || uploading}
            className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all ${
              files.length === 0 || uploading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 active:scale-95'
            }`}
          >
            {uploading ? `Uploading ${files.length} file${files.length > 1 ? 's' : ''}...` : `Upload ${files.length} file${files.length > 1 ? 's' : ''}`}
          </button>
        </form>

        {/* Additional Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Files are processed automatically by AI for categorization and duplicate detection</p>
        </div>
      </div>
    </div>
  );
}
