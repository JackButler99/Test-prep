import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: false },
      { source: "/catalog", destination: "/paket", permanent: false },
      { source: "/instructor", destination: "/", permanent: false },
    ];
  },
};
export default nextConfig;
