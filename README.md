# ChurnGuard AI - Predictive Customer Analytics Platform

[![Deploy to Cloudflare][![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rahilubare/churnguard-ai-predictive-customer-analytics-platform)](https://deploy.workers.cloudflare.com/?url=${repositoryUrl})

A professional-grade, serverless machine learning platform for predicting customer churn with client-side training and edge deployment. ChurnGuard AI enables businesses to upload customer datasets, train Random Forest models in the browser, visualize performance metrics, and deploy models to Cloudflare's edge for low-latency predictions.

## Features

- **Data Studio**: Drag-and-drop CSV upload with automatic schema detection, data preview, and preprocessing statistics (missing values, categorical encoding).
- **Model Lab**: One-click Random Forest training in the browser, real-time progress, evaluation metrics (Accuracy, F1, ROC-AUC), and feature importance visualizations.
- **Prediction Center**: Single-profile and batch predictions with SHAP-based explainability.
- **Dashboard & Analytics**: Executive overview of model performance, churn risk distribution, and customer health metrics.
- **Edge Deployment**: Trained models serialized and deployed to Cloudflare Durable Objects for global, sub-10ms inference APIs.
- **Interpretability**: Feature importance charts, confusion matrices, and ROC curves powered by Recharts.
- **Responsive Design**: Beautiful, mobile-first UI with shadcn/ui, Tailwind, and Framer Motion animations.
- **Production-Ready**: Error handling, loading states, validation (Zod), and state management (Zustand).

## Tech Stack

- **Frontend**: React 18, React Router, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Recharts, Lucide React
- **ML Libraries**: PapaParse (CSV), ml-random-forest, ml-matrix, ml-cart
- **Backend**: Hono, Cloudflare Workers, Durable Objects (via custom entity library)
- **State & Data**: Zustand, TanStack Query, Zod, React Hook Form
- **Build Tools**: Vite, Bun, Wrangler
- **Utilities**: clsx, tailwind-merge, sonner (toasts), uuid

## Quick Start

### Prerequisites
- [Bun](https://bun.sh/) (package manager)
- [Cloudflare Account](https://dash.cloudflare.com/) with Workers enabled
- `wrangler` CLI: `bunx wrangler@latest login`

### Installation
```bash
bun install
```

### Development
```bash
# Start local dev server (frontend + worker proxy)
bun dev

# Open http://localhost:3000
```

### Build & Preview
```bash
bun build    # Build frontend
bun preview  # Preview production build
```

## Usage

1. **Upload Data**: Navigate to Data Studio, drag CSV with customer features (e.g., tenure, balance, churn target).
2. **Train Model**: Select target column, configure params, train Random Forest in-browser.
3. **Evaluate**: View metrics dashboard, feature importance bar chart.
4. **Deploy**: Click "Deploy to Edge" to save model via `/api/models`.
5. **Predict**: Use Prediction Center or API (`POST /api/predict`) for new data scoring.

Example API call:
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/predict \
  -H "Content-Type: application/json" \
  -d '{"modelId": "abc123", "customer": {"tenure": 5, "balance": 1000}}'
```

## Development Workflow

- **Frontend**: Edit `src/pages/HomePage.tsx` (main dashboard) and add routes in `src/main.tsx`.
- **Backend Routes**: Add endpoints in `worker/user-routes.ts` using entity helpers (e.g., `ModelEntity.create`).
- **Entities**: Extend `IndexedEntity` in `worker/entities.ts` for models/datasets.
- **Shared Types**: Define in `shared/types.ts`.
- **Testing**: Use TanStack Query for data fetching; mock APIs available.
- **Linting**: `bun lint`
- **Types**: `bunx wrangler types` (Cloudflare bindings)

Follow UI guidelines: shadcn/ui first, Tailwind v3-safe, responsive gutters (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`).

## Deployment

Deploy to Cloudflare Workers with full-stack support (frontend + backend):

```bash
bun deploy
```

This builds the frontend, bundles the worker, and deploys everything globally.

**[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rahilubare/churnguard-ai-predictive-customer-analytics-platform)**

**Post-Deploy**:
- Custom domain: `wrangler deploy --var DOMAIN:yourdomain.com`
- Environment vars/bindings: Edit `wrangler.jsonc` (DO NOT MODIFY bindings).
- Preview branches: `wrangler deploy --branch preview`

## Architecture

```
CSV Upload → Browser (PapaParse + ml-random-forest) → Trained Model JSON
↓
POST /api/models → Cloudflare Worker → Durable Object Storage
↓
Predict Request → Worker → Load Model → Edge Inference (<10ms)
```

- **Client-Side Training**: Avoids serverless CPU limits using Web Workers.
- **Persistence**: Single `GlobalDurableObject` with indexed entities (models, datasets).
- **Scalability**: Global replication, no cold starts for inference.

## Roadmap

- [x] Phase 1: Dashboard shell, Data Studio (CSV parsing)
- [ ] Phase 2: ML training, evaluation visuals, deployment
- [ ] Phase 3: Inference API, explainability, full polish

## Contributing

1. Fork & clone
2. `bun install`
3. `bun dev`
4. Submit PR with tests/docs

## License

MIT. See [LICENSE](LICENSE) for details.

## Support

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- Issues: [GitHub Issues](https://github.com/your-org/churnguard-ai/issues)

Built with ❤️ by Cloudflare's Expert Engineering Team.