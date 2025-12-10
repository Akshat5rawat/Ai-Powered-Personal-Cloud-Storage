import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api';
import { isAuthenticated } from '../utils/auth';

export default function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
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
        {results.map(r => (
          <div key={r.file._id} className="p-4 bg-white rounded shadow flex justify-between items-center">
            <div>
              <div className="font-bold">{r.file.filename}</div>
              <div className="text-sm text-gray-500">Score: {r.score.toFixed(3)}</div>
            </div>
            <div>Category: {r.file.category}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
