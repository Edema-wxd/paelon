import type { NextConfig } from "next";

import { redirectsForNextConfig } from "./lib/redirects";

const nextConfig: NextConfig = {
  /**
   * 301s from the old WordPress site. The list itself lives in lib/redirects.ts
   * and is currently empty pending the old URL export (master spec §18).
   */
  async redirects() {
    return redirectsForNextConfig();
  },
};

export default nextConfig;
