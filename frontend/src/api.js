import axios from 'axios';

// Automatically detect the current host and use it for API calls
const getApiUrl = () => {
  // Get the current window location
  const hostname = window.location.hostname;
  
  // If running on localhost, use localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  
  // Otherwise, use the current IP/hostname with backend port
  return `http://${hostname}:5000` || 'https://vercel.com/akshat5rawats-projects/ai-powered-personal-cloud-backend';
};

const API_URL = getApiUrl();

const client = axios.create({ baseURL: API_URL });
client.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;