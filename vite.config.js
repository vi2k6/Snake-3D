import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Detect environment (GitHub Pages vs Netlify vs Local)
const repoName = 'Snake-3D'
const isGithub = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  plugins: [react()],
  base: isGithub ? `/${repoName}/` : '/', 
})
