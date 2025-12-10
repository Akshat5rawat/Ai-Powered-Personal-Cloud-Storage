import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();
  
  const handle = async (e) => {
    e.preventDefault();
    try {
      const res = await client.post('/auth/login', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('username', res.data.username);
      alert('Logged in successfully');
      window.location.href = '/'; // Force reload to update Header state
    } catch (err) {
      alert('Login failed: ' + (err.response?.data?.message || 'Invalid credentials'));
    }
  };
  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
      <form onSubmit={handle}>
        <label className="block text-sm font-medium mb-1">Username or Email</label>
        <input 
          value={form.email} 
          onChange={e => setForm({ ...form, email: e.target.value })} 
          className="border p-2 w-full my-2 rounded focus:ring-2 focus:ring-blue-500" 
          placeholder="Enter username or email"
          required
        />
        <label className="block text-sm font-medium mb-1">Password</label>
        <input 
          value={form.password} 
          onChange={e => setForm({ ...form, password: e.target.value })} 
          type="password" 
          className="border p-2 w-full my-2 rounded focus:ring-2 focus:ring-blue-500" 
          placeholder="Enter password"
          required
        />
        <button className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded w-full font-semibold transition mt-2">Login</button>
        <p className="text-center text-sm text-gray-600 mt-4">
          Don't have an account? <a href="/register" className="text-blue-500 hover:underline">Register here</a>
        </p>
      </form>
    </div>
  );
}
