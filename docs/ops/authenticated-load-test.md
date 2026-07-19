# Authenticated load smoke (Preview only)

Do **not** run against production.

```bash
# After vercel deploy --yes, warm up, then:
export BASE_URL="https://YOUR-preview.vercel.app"
export LOAD_PROFILE=authenticated
export SESSION_COOKIE="next-auth.session-token=..." # or __Secure-next-auth.session-token
npm run load-test:smoke
```

Paths: `/api/health`, `/api/auth/session`, `/api/dashboard/stats`, `/api/projects`, `/api/search?q=test`

Thresholds (profile defaults): P95 &lt; 2000ms, error rate &lt; 5%.

Record PASS/FAIL per path in the PR description.
