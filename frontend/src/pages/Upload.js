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
  const [duplicateModal, setDuplicateModal] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [savedDuplicates, setSavedDuplicates] = useState([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
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

  // Check for duplicate before upload
  const checkDuplicate = async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await client.post('/files/check-duplicate', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data;
    } catch (err) {
      console.error('Duplicate check failed:', err);
      return { isDuplicate: false };
    }
  };

  // Upload a single file
  const uploadFile = async (file, index, progressMap) => {
    const form = new FormData();
    form.append('file', file);
    
    await client.post('/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        progressMap[index] = percentCompleted;
        setUploadProgress({ ...progressMap });
      }
    });
    
    setCompletedUploads(prev => [...prev, index]);
    progressMap[index] = 100;
    setUploadProgress({ ...progressMap });
  };

  // Handle user decision on duplicate
  const handleDuplicateDecision = async (keepDuplicate) => {
    if (!pendingUpload) return;
    
    const { file, index, progressMap, remainingFiles } = pendingUpload;
    
    if (keepDuplicate) {
      // User wants to save the duplicate
      try {
        await uploadFile(file, index, progressMap);
        setSavedDuplicates(prev => [...prev, index]); // Track as saved duplicate
      } catch (err) {
        alert(`Failed to upload ${file.name}: ${err.response?.data?.message || err.message}`);
      }
    } else {
      // User wants to skip/delete this duplicate
      progressMap[index] = -1; // Mark as skipped
      setUploadProgress({ ...progressMap });
    }
    
    setDuplicateModal(null);
    setPendingUpload(null);
    
    // Continue with remaining files
    await processRemainingFiles(remainingFiles, progressMap);
  };

  // Process remaining files after duplicate decision
  const processRemainingFiles = async (remainingFiles, progressMap) => {
    for (let i = 0; i < remainingFiles.length; i++) {
      const { file, index } = remainingFiles[i];
      
      try {
        // Check for duplicate
        const duplicateCheck = await checkDuplicate(file);
        
        if (duplicateCheck.isDuplicate) {
          // Show modal and wait for user decision
          setDuplicateModal({
            filename: file.name,
            duplicateOf: duplicateCheck.duplicateOf.filename,
            message: duplicateCheck.message
          });
          setPendingUpload({
            file,
            index,
            progressMap,
            remainingFiles: remainingFiles.slice(i + 1)
          });
          return; // Stop processing, wait for user decision
        }
        
        // No duplicate, proceed with upload
        await uploadFile(file, index, progressMap);
        
      } catch (err) {
        alert(`Failed to upload ${file.name}: ${err.response?.data?.message || err.message}`);
      }
    }
    
    // All files processed
    finishUpload();
  };

  const finishUpload = () => {
    setTimeout(() => {
      setFiles([]);
      setUploadProgress({});
      setCompletedUploads([]);
      setSavedDuplicates([]);
      setUploading(false);

      // Show upload completed popup
      setToastMessage('All files uploaded successfully!');
      setShowToast(true);
    }, 2000);
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
    
    // Prepare file list with indices
    const fileList = files.map((file, index) => ({ file, index }));
    
    // Start processing files
    await processRemainingFiles(fileList, progressMap);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white p-8 rounded-lg shadow-lg">
        {/* Upload Complete Modal Popup */}
        {showToast && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md text-center shadow-2xl animate-bounce-in">
              <div className="mb-4">
                <svg className="h-16 w-16 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Success!</h3>
              <p className="text-gray-600 mb-6">{toastMessage}</p>
              <button
                onClick={() => setShowToast(false)}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
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
                {/* Supported File Types */}
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                    <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <rect x="3" y="3" width="18" height="14" rx="2" ry="2" strokeWidth="1.5" />
                      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                    </svg>
                    <span className="text-xs font-medium text-blue-700">Images</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M7 7h10v10H7z" strokeWidth="1.5" />
                      <path d="M9 9h6v6H9z" strokeWidth="1" />
                    </svg>
                    <span className="text-xs font-medium text-green-700">Documents</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg">
                    <svg className="w-4 h-4 text-purple-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <rect x="2" y="6" width="20" height="12" rx="2" ry="2" strokeWidth="1.5" />
                      <path d="M8 10l3 2-3 2V10z" strokeWidth="1" />
                    </svg>
                    <span className="text-xs font-medium text-purple-700">Videos</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-pink-50 rounded-lg">
                    <svg className="w-4 h-4 text-pink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M12 3v18" strokeWidth="1.5" />
                      <path d="M8 7a4 4 0 018 0v6a4 4 0 01-8 0V7z" strokeWidth="1" />
                    </svg>
                    <span className="text-xs font-medium text-pink-700">Audio</span>
                  </div>
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
                        <div className="flex flex-col items-center">
                          <svg className="h-6 w-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {savedDuplicates.includes(index) && (
                            <span className="text-xs text-orange-500 font-medium">Duplicate</span>
                          )}
                        </div>
                      )}
                      {uploadProgress[index] === -1 && (
                        <span className="text-sm text-orange-500 font-medium">Skipped (Duplicate)</span>
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
                  {/* Progress Bar for each file */}
                  {uploading && uploadProgress[index] !== undefined && uploadProgress[index] !== -1 && (
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

      {/* Duplicate Detection Modal */}
      {duplicateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <div className="bg-yellow-100 rounded-full p-3">
                <svg className="h-8 w-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-center text-gray-800 mb-2">
              Duplicate File Detected
            </h3>

            {/* Message */}
            <div className="text-center mb-6">
              <p className="text-gray-600 mb-2">
                <span className="font-semibold text-blue-600">"{duplicateModal.filename}"</span>
              </p>
              <p className="text-gray-600">
                is a duplicate of
              </p>
              <p className="text-gray-600 mt-2">
                <span className="font-semibold text-orange-600">"{duplicateModal.duplicateOf}"</span>
              </p>
            </div>

            {/* Question */}
            <p className="text-center text-gray-700 mb-6">
              Do you want to save this duplicate file or skip it?
            </p>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => handleDuplicateDecision(false)}
                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Skip Duplicate</span>
              </button>
              <button
                onClick={() => handleDuplicateDecision(true)}
                className="flex-1 py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                <span>Save Duplicate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Success Modal Popup */}
      {showToast && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center shadow-2xl">
            {/* Success Checkmark Icon */}
            <div className="mb-4">
              <svg
                className="h-20 w-20 text-green-500 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            {/* Success Message */}
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Upload Successful!</h3>
            <p className="text-gray-600 mb-6">{toastMessage}</p>

            {/* Close Button */}
            <button
              onClick={() => setShowToast(false)}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
