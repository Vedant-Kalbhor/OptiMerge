// Format file size
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Download data as CSV
  export const downloadCSV = (data, filename) => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + data.map(row => Object.values(row).join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Format percentage
  export const formatPercent = (value) => {
    return `${(value * 100).toFixed(1)}%`;
  };
  
  // Validate file type
  export const validateFileType = (file, allowedTypes) => {
    const fileExtension = file.name.split('.').pop().toLowerCase();
    return allowedTypes.includes(`.${fileExtension}`);
  };