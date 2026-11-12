# BanglaGuard

BanglaGuard is a research workspace for **Bangla and Banglish hate speech detection and sentiment analysis**. It connects text prediction and model explanations to dataset preparation, reproducible training, error analysis, feedback, and model promotion.

The [Developer Guide](docs/DEVELOPER_GUIDE.md) covers Windows and macOS setup, architecture, data and training flows, configuration, testing, troubleshooting, and operational limits.

## Run locally

Use **Python 3.14**, **Node.js 22 or 24 with npm** (Next.js requires at least 20.9), Git, and Docker Compose v2. On Windows, use **WSL 2** for the backend and training worker; follow the [Windows setup](docs/DEVELOPER_GUIDE.md#windows-wsl-2) before running these shell commands.

From the repository root:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
python3.14 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r requirements.txt
docker compose up -d --wait
```

Before starting the backend, replace the placeholder `SECRET_KEY` in `.env` with a local random secret. Run each server in its own terminal:

```bash
# Terminal 1 — start from the repository root
cd backend
source .venv/bin/activate
alembic upgrade head
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2 — start from the repository root
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open [the app](http://localhost:3000), [API documentation](http://localhost:8000/docs), or [service readiness](http://localhost:8000/api/v1/health/ready). A fresh installation starts with no trained model. Follow [First run](docs/DEVELOPER_GUIDE.md#first-run-account-and-model) to set up a local research account, train a baseline, and run a prediction.

Trained models and private research data stay outside Git. Predictions and attributions are research outputs; they can be wrong, including at high confidence.
