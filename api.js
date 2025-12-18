import axios from "axios";

// On Vercel (prod), définis VITE_API_BASE avec l’URL Render, ex:
// https://lps-api.onrender.com
export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export function api(token) {
  const inst = axios.create({ baseURL: API_BASE });
  inst.interceptors.request.use((config) => {
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  return inst;
}
