import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // This app lives in a subdirectory of the OmniRoute repository. Pin both
  // Turbopack resolution and output tracing to this standalone application so
  // the parent repository's Next.js app and middleware are never discovered.
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
