import api from './api';

export const checkApiHealth = (config) => api.get('/health', config).then((response) => response.data);
