# Git Setup & Push Guide

This document describes how to push the **SOVERN MindMap Control Plane** to a remote Git repository (GitHub/GitLab/Gitea).

## 1. Initialize Git

In your terminal, navigate to the project directory:

```powershell
cd "C:\telo\Efforts\On\MindMapping\sovern-mindmap"
git init
```

## 2. Configure .gitignore

I have already prepared a `.gitignore` file, but make sure it includes the following to avoid tracking large or sensitive files:

```text
# Node
node_modules/
dist/
dist-mcp/

# Tauri
src-tauri/target/

# OS
.DS_Store
Thumbs.db

# Env
.env
*.local
```

## 3. Initial Commit

```powershell
git add .
git commit -m "feat: initial alpha release of SOVERN MindMap Control Plane (v3.3)"
```

## 4. Push to Remote

Create a new repository on your Git provider, then run:

```powershell
# Replace with your actual URL
git remote add origin https://github.com/YOUR_USERNAME/sovern-mindmap.git
git branch -M main
git push -u origin main
```

## ⚠️ Important Note
**Do not** commit your actual `.canvas` files if they contain private project data or sensitive ideas. Move them to a separate `/vault` folder and add that folder to `.gitignore` if needed.

---
**SOVERN v3.3 · Development Team**
