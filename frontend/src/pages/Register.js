import React, { useState } from 'react';
import client from '../api';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const [form, setForm] = useState({ email: '', password: '' });
  const navigate = useNavigate();
  const handle = async (e) => {
    e.preventDefault();
    try {
      const res = await client.post('/auth/register', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('userEmail', form.email);
      alert('Registered and logged in successfully');
      window.location.href = '/'; // Force reload to update Header state
    } catch (err) {
      alert('Failed to register: ' + (err.response?.data?.message || err.message));
    }
  };
  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h2 className="text-2xl mb-4">Register</h2>
      <form onSubmit={handle}>
        <label className="block">Email</label>
        <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="border p-2 w-full my-2" />
        <label className="block">Password</label>
        <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} type="password" className="border p-2 w-full my-2" />
        <button className="bg-green-500 text-white px-4 py-2 rounded">Register</button>
      </form>
    </div>
  );
}
