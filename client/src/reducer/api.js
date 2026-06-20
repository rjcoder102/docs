// import axios from "axios";



/// src/reducer/api.js
import axios from "axios";

// const API_BASE_URL = "http://localhost:8000/api";
// const API_BASE_URL = "https://api-docs.space/api";
const API_BASE_URL = "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});


// // const AP// Request interceptor to add headers
api.interceptors.request.use((config) => {
  // Add domain header
  // config.headers['x-domain'] = window.location.hostname;
  config.headers['x-domain'] = 'api-docs.space';
  
  // Add internal request header to bypass IP validation for docs
  config.headers['x-internal-request'] = 'true';
  
  console.log('Request headers:', config.headers); // Debug log
  
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);



