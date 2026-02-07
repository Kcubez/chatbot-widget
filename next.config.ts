import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  rewrites: async () => {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/chat',
          destination: 'http://127.0.0.1:8000/api/chat',
        },
        {
          source: '/api/python',
          destination: 'http://127.0.0.1:8000/api/python',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
