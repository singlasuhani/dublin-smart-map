import { useState, useCallback } from 'react';

// Use environment variable for deployed API, fallback to '/api' for local proxy
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (endpoint, params = {}) => {
    setLoading(true);
    setError(null);
    try {
      // Handle both absolute URLs (production) and relative paths (local proxy)
      const baseUrl = API_BASE.startsWith('http') ? API_BASE : `${window.location.origin}${API_BASE}`;
      const url = new URL(`${baseUrl}${endpoint}`);
      Object.keys(params).forEach(key => {
        const value = params[key];
        if (Array.isArray(value)) {
          value.forEach(v => url.searchParams.append(key, v));
        } else if (value) {
          url.searchParams.append(key, value);
        }
      });

      const response = await fetch(url);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      return data;
    } catch (err) {
      setError(err.message);
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchData, loading, error };
};