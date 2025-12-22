import React, { useState } from 'react';
import client from '../api';
import { useNavigate } from 'react-router-dom';

export default function Register() {
  const [form, setForm] = useState({ 
    username: '', 
    fullName: '', 
    email: '', 
    password: '', 
    gender: '', 
    dob: '', 
    phoneNo: '' 
  });
  const navigate = useNavigate();

  const calculateAge = (dob) => {
    const birthDate = new Date(dob);
    const age = Math.floor((new Date() - birthDate) / (365.25 * 24 * 60 * 60 * 1000));
    return age;
  };

  const handle = async (e) => {
    e.preventDefault();

    // Validate all fields
    if (!form.username || !form.fullName || !form.email || !form.password || !form.gender || !form.dob || !form.phoneNo) {
      alert('Please fill in all fields');
      return;
    }

    // Validate age
    const age = calculateAge(form.dob);
    if (age < 18) {
      alert('You must be at least 18 years old to register');
      return;
    }

    // Validate password length
    if (form.password.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(form.phoneNo)) {
      alert('Please enter a valid 10-digit phone number');
      return;
    }

    try {
      const res = await client.post('/auth/register', form);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('username', form.username);
      
      // Trigger notification for successful registration
      window.dispatchEvent(new CustomEvent('app-notification', {
        detail: { message: `Account created successfully! Welcome, ${form.username}!` }
      }));
      
      alert('Registered and logged in successfully');
      window.location.href = '/'; // Force reload to update Header state
    } catch (err) {
      alert('Failed to register: ' + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-8 rounded shadow">
      <h2 className="text-3xl font-bold mb-6 text-center">Create Account</h2>
      <form onSubmit={handle} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Username *</label>
          <input 
            value={form.username} 
            onChange={e => setForm({ ...form, username: e.target.value })} 
            className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500" 
            placeholder="Enter username"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Full Name *</label>
          <input 
            value={form.fullName} 
            onChange={e => setForm({ ...form, fullName: e.target.value })} 
            className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500" 
            placeholder="Enter your full name"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email *</label>
          <input 
            type="email"
            value={form.email} 
            onChange={e => setForm({ ...form, email: e.target.value })} 
            className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500" 
            placeholder="Enter email address"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Password *</label>
          <input 
            value={form.password} 
            onChange={e => setForm({ ...form, password: e.target.value })} 
            type="password" 
            className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500" 
            placeholder="At least 6 characters"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Gender *</label>
          <select 
            value={form.gender} 
            onChange={e => setForm({ ...form, gender: e.target.value })} 
            className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date of Birth * (Must be 18+)</label>
          <input 
            type="date"
            value={form.dob} 
            onChange={e => setForm({ ...form, dob: e.target.value })} 
            className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500"
            max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Phone Number *</label>
          <input 
            type="tel"
            value={form.phoneNo} 
            onChange={e => setForm({ ...form, phoneNo: e.target.value })} 
            className="border p-2 w-full rounded focus:ring-2 focus:ring-blue-500" 
            placeholder="10-digit phone number"
            pattern="[0-9]{10}"
            required
          />
        </div>

        <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded w-full font-semibold transition">
          Register
        </button>

        <p className="text-center text-sm text-gray-600 mt-4">
          Already have an account? <a href="/login" className="text-blue-500 hover:underline">Login here</a>
        </p>
      </form>
    </div>
  );
}
