# HireDispatchDesk
Cloud-based hire/taxi dispatch and driver management system.

## GitHub → Vercel preview (for presentations)
You can upload this repo to GitHub and let Vercel automatically deploy preview/production URLs.

### What is configured in this repository
- `vercel.json` is included for this monorepo structure.
- Vercel installs/builds from the `client` folder and serves `client/dist`.
- SPA rewrite is enabled so deep links route to `index.html`.

### Setup steps
1. Push this repository to GitHub.
2. In Vercel, click **Add New Project** and import this GitHub repository.
3. Confirm deploy settings (the included `vercel.json` will be used automatically).
4. Click **Deploy**.

### Result
- Every push to GitHub will trigger Vercel deployments.
- You get a shareable URL for today's presentation.
