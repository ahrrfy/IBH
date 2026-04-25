# Al-Ruya AI Brain

Tier 2/3 AI service. Lazy Tier 1 (Qwen 7B via Ollama) loaded on demand only.

## Run

```bash
cd apps/ai-brain
pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8001
```

## Endpoints

- `GET  /health`     — liveness
- `POST /anomaly`    — PyOD Isolation Forest on a numeric series
- `POST /forecast`   — Prophet 30-day demand forecast

Both endpoints fall back to lightweight numpy heuristics when the heavy
ML deps (PyOD, Prophet) are not installed — useful for dev/CI smoke tests.
