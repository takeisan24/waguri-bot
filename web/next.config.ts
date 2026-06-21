import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Repo có 2 package-lock (gốc cho bot + web) -> chỉ rõ root của web để hết cảnh báo infer.
  turbopack: { root: __dirname },
};

export default nextConfig;
