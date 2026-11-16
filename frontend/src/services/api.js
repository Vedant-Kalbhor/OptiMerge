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

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
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

export const analyzeWeldmentPairwise = async (data) => {
  try {
    console.log('Starting weldment pairwise analysis...');
    const response = await api.post('/analyze/weldment-pairwise/', data);
    return response;
  } catch (error) {
    console.error('Weldment pairwise analysis error:', error);
    throw error;
  }
};

export const calculateBOMSavings = async (formData) => {
  try {
    console.log('Calculating BOM savings...');
    const response = await api.post('/calculate-bom-savings/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000,
    });
    return response;
  } catch (error) {
    console.error('Calculate BOM savings error:', error);
    throw error;
  }
};

export const deleteAnalysis = async (analysisId) => {
  try {
    const response = await api.delete(`/analysis/${analysisId}`);
    return response;
  } catch (error) {
    console.error('Delete analysis error:', error);
    throw error;
  }
};

export const extractDimensions = async (formData) => {
  return api.post('/extract-dimensions/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
};

export const extractDimensionsBbox = async (formData) => {
  return api.post('/extract-dimensions-bbox/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  });
};

// Pipe endpoints
export const uploadPipes = async (formData) => {
  try {
    console.log('Uploading Pipes...');
    const response = await api.post('/upload/pipes/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000,
    });
    return response;
  } catch (error) {
    console.error('Upload pipes error:', error);
    throw error;
  }
};

export const getPipeFiles = async () => {
  try {
    const response = await api.get('/files/pipes/');
    return response;
  } catch (error) {
    console.error('Get pipe files error:', error);
    throw error;
  }
};

export const analyzePipePairwise = async (data) => {
  try {
    console.log('Starting pipe pairwise analysis...');
    const response = await api.post('/analyze/pipe-pairwise/', data);
    return response;
  } catch (error) {
    console.error('Pipe pairwise analysis error:', error);
    throw error;
  }
};

export const exportPipeReport = async (analysisId, mode = 'xyz_only', format = 'excel') => {
  try {
    const response = await api.get(`/export/pipes/${analysisId}`, {
      params: { mode, format },
      responseType: 'blob',
    });
    return response;
  } catch (error) {
    console.error('Export pipe report error:', error);
    throw error;
  }
};




export const uploadBends = async (formData) => {
  try {
    console.log('Uploading Bend/Snap data...');

    const response = await api.post(
      '/upload/bends/',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000,
      }
    );

    return response;
  } catch (error) {
    console.error('Upload bend data error:', error);
    throw error;
  }
};

export const getBendFiles = async () => {
  try {
    const response = await api.get('/files/bends/');
    return response;
  } catch (error) {
    console.error('Get bend files error:', error);
    throw error;
  }
};

export const analyzeBendPairwise = async (data) => {
  try {
    console.log('Starting bend pairwise analysis...');

    const response = await api.post(
      '/analyze/bend-pairwise/',
      data
    );

    return response;
  } catch (error) {
    console.error('Bend pairwise analysis error:', error);
    throw error;
  }
};

export const uploadImageOrPdf = async (formData) => {
  try {
    console.log('Uploading engineering drawing...');
    const response = await api.post('/upload/image-or-pdf/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      responseType: 'blob',
      timeout: 3000000,
    });
    return response;
  } catch (error) {
    console.error('Engineering drawing upload error:', error);
    throw error;
  }
};

// Custom Analysis Endpoints
export const getCustomAnalyses = async () => {
  try {
    return await api.get('/custom-analyses/');
  } catch (error) {
    console.error('Failed to fetch custom analyses:', error);
    throw error;
  }
};

export const getCustomAnalysis = async (id) => {
  try {
    return await api.get(`/custom-analyses/${id}`);
  } catch (error) {
    console.error(`Failed to fetch custom analysis ${id}:`, error);
    throw error;
  }
};

export const saveCustomAnalysis = async (data) => {
  try {
    return await api.post('/custom-analyses/', data);
  } catch (error) {
    console.error('Failed to save custom analysis:', error);
    throw error;
  }
};

export const updateCustomAnalysis = async (id, data) => {
  try {
    return await api.put(`/custom-analyses/${id}`, data);
  } catch (error) {
    console.error(`Failed to update custom analysis ${id}:`, error);
    throw error;
  }
};

export const deleteCustomAnalysis = async (id) => {
  try {
    return await api.delete(`/custom-analyses/${id}`);
  } catch (error) {
    console.error(`Failed to delete custom analysis ${id}:`, error);
    throw error;
  }
};

export const extractCustomHeaders = async (formData) => {
  try {
    return await api.post('/custom-analyses/extract-headers/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  } catch (error) {
    console.error('Failed to extract headers from file:', error);
    throw error;
  }
};

export const uploadCustom = async (formData) => {
  try {
    return await api.post('/upload/custom/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  } catch (error) {
    console.error('Failed to upload custom file:', error);
    throw error;
  }
};

export const getCustomFiles = async () => {
  try {
    return await api.get('/files/custom/');
  } catch (error) {
    console.error('Failed to fetch custom files:', error);
    throw error;
  }
};

export const analyzeCustomPairwise = async (data) => {
  try {
    return await api.post('/analyze/custom-pairwise/', data);
  } catch (error) {
    console.error('Failed to run custom pairwise analysis:', error);
    throw error;
  }
};

export const exportCustomReport = async (analysisId) => {
  try {
    return await api.get(`/export/custom/${analysisId}`, {
      responseType: 'blob',
    });
  } catch (error) {
    console.error('Failed to export custom report:', error);
    throw error;
  }
};

export default api;