# Quarter success metrics (roadmap)

Track after Weeks 1–12 land:

1. **Time to first scan→save** — median minutes for new orgs (PostHog `wizard_step` + scan save events).
2. **Dashboard P95** — Preview authenticated load (`LOAD_PROFILE=authenticated`); target &lt; 2000ms.
3. **Embedding coverage** — % of contacts with `ContactSearchEmbedding` (+ pgvector column when `USE_PGVECTOR=true`).
4. **Legacy widgets** — consolidated types in `WidgetContent` resolve via `resolveWidgetOpen` (no dual boards).
5. **CI gate** — `npm run test:e2e:ci-gate` (4 core specs) green on PRs.
