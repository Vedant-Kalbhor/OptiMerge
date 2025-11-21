import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Create axios instance with better error handling
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 seconds timeout for file uploads
});

// Add request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`Making ${config.method?.toUpperCase()} request to: ${config.url}`);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => {
    console.log(`Response received: ${response.status}`);
    return response;
  },
  (error) => {
    console.error('Response error:', error);
    
    if (error.code === 'ECONNREFUSED') {
      error.message = 'Cannot connect to server. Please make sure the backend is running on port 8000.';
    } else if (error.response) {
      // Server responded with error status
      error.message = error.response.data?.detail || error.response.statusText || 'Server error';
    } else if (error.request) {
      // Request made but no response received
      error.message = 'No response from server. Please check your connection.';
    }
    
    return Promise.reject(error);
  }
);

// Weldment endpoints
export const uploadWeldments = async (formData) => {
  try {
    console.log('Uploading weldments...');
    const response = await api.post('/upload/weldments/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // 2 minutes for file upload
    });
    return response;
  } catch (error) {
    console.error('Upload weldments error:', error);
    throw error;
  }
};

export const getWeldmentFiles = async () => {
  try {
    const response = await api.get('/files/weldments/');
    return response;
  } catch (error) {
    console.error('Get weldment files error:', error);
    throw error;
  }
};

// BOM endpoints
export const uploadBOMs = async (formData) => {
  try {
    console.log('Uploading BOMs...');
    const response = await api.post('/upload/boms/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000, // 2 minutes for file upload
    });
    return response;
  } catch (error) {
    console.error('Upload BOMs error:', error);
    throw error;
  }
};

export const getBOMFiles = async () => {
  try {
    const response = await api.get('/files/boms/');
    return response;
  } catch (error) {
    console.error('Get BOM files error:', error);
    throw error;
  }
};

// Analysis endpoints
export const analyzeDimensionalClustering = async (data) => {
  try {
    console.log('Starting dimensional clustering analysis...');
    const response = await api.post('/analyze/dimensional-clustering/', data);
    return response;
  } catch (error) {
    console.error('Dimensional clustering error:', error);
    throw error;
  }
};

export const analyzeBOMSimilarity = async (data) => {
  try {
    console.log('Starting BOM similarity analysis...');
    const response = await api.post('/analyze/bom-similarity/', data);
    return response;
  } catch (error) {
    console.error('BOM similarity analysis error:', error);
    throw error;
  }
};

export const getAnalysisResults = async (analysisId) => {
  try {
    const response = await api.get(`/analysis/${analysisId}`);
    return response;
  } catch (error) {
    console.error('Get analysis results error:', error);
    throw error;
  }
};

// Health check
export const healthCheck = async () => {
  try {
    const response = await api.get('/health');
    return response;
  } catch (error) {
    console.error('Health check error:', error);
    throw error;
  }
};

export const getRecentAnalyses = async () => {
  return api.get('/recent-analyses');
};

export default api;