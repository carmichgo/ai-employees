import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ai-employees/shared"],
  // Allow file uploads up to 10MB through the Next.js proxy layer
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config) => {
    // Allow .js imports to resolve to .ts files (standard ESM TypeScript pattern)
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts"],
      ".jsx": [".jsx", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
