import axios from 'axios';

// Use localhost for development, use the provided Vercel URL in production
const VERCEL_API = 'https://vercel.com/akshat5rawats-projects/ai-powered-personal-cloud-backend';

const getApiUrl = () => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  return VERCEL_API;
};

const API_URL = getApiUrl();

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;