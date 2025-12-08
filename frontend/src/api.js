import axios from 'axios';
const DEFAULT_PROD_API = 'https://ai-powered-personal-cloud-storage-6.vercel.app/'; 
// Automatically detect the current host and use it for API calls
const getApiUrl = () => {
  // Get the current window location
  const hostname = window.location.hostname;
  
  // If running on localhost, use localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  
  // Otherwise, use the current IP/hostname with backend port
  return DEFAULT_PROD_API || `http://${hostname}:5000`;
};

const API_URL = getApiUrl();

const client = axios.create({ baseURL: API_URL });
client.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;