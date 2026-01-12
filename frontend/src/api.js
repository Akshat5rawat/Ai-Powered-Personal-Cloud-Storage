import axios from 'axios';
const DEFAULT_PROD_API = process.env.REACT_APP_API_URL; 
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

// Add auth token to all requests
client.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401/403 responses by clearing invalid token and redirecting to login
client.interceptors.response.use(
  response => response,
  error => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Token is invalid or expired - clear it and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      
      // Only redirect if not already on login/register page
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && currentPath !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default client;