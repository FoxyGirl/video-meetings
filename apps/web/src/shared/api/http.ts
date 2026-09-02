import axios from 'axios';
import { getAuthSnapshot } from '@/lib/auth-store';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const http = axios.create({ baseURL: API_URL });

http.interceptors.request.use((config) => {
  const auth = getAuthSnapshot();
  if (auth) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});
