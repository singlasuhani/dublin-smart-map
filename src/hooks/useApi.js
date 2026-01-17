import { useState, useCallback } from 'react';

const API_BASE = '/api';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (endpoint, params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${window.location.origin}${API_BASE}${endpoint}`);
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
