import React, { useState } from 'react';
import client from '../api';

export default function Upload() {
  const [file, setFile] = useState(null);
  const handle = async (e) => {
    e.preventDefault();
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await client.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert('Uploaded: ' + res.data.fileId);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    }
  };
  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-2xl mb-4">Upload File</h2>
      <form onSubmit={handle}>
        <input type="file" onChange={e => setFile(e.target.files[0])} />
        <button className="bg-green-500 text-white px-4 py-2 rounded mt-4">Upload</button>
      </form>
    </div>
  );
}
