/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't auto-generate AGENTS.md / CLAUDE.md in the project root.
  agentRules: false,
  // Keep native/server-only deps out of the client + server bundle so they
  // load from node_modules at runtime (matches how the old Express server ran).
  serverExternalPackages: ['pg', 'cloudinary', 'nodemailer'],
};

module.exports = nextConfig;
