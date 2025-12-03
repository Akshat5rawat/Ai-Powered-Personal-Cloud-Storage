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
      localStorage.setItem('userEmail', form.email);
      alert('Logged in successfully');
      window.location.href = '/'; // Force reload to update Header state
    } catch (err) {
      alert('Login failed: ' + (err.response?.data?.message || 'Invalid credentials'));
    }
  };
  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-2xl mb-4">Login</h2>
      <form onSubmit={handle}>
        <label className="block">Email</label>
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="border p-2 w-full my-2" />
        <label className="block">Password</label>
        <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} type="password" className="border p-2 w-full my-2" />
        <button className="bg-blue-500 text-white px-4 py-2 rounded">Login</button>
      </form>
    </div>
  );
}
