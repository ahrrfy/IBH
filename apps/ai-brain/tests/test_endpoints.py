"""
Smoke tests for the AI Brain service.
Run: pytest -q
"""

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


def test_health() -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_anomaly_detects_outlier() -> None:
    series = [10.0] * 20 + [500.0] + [10.0] * 9
    r = client.post("/anomaly", json={"series": series, "contamination": 0.05})
    assert r.status_code == 200
    body = r.json()
    assert 20 in body["anomaly_indices"]


def test_forecast_returns_horizon() -> None:
    history = [{"ds": f"2026-01-{d:02d}", "y": 100 + d} for d in range(1, 22)]
    r = client.post("/forecast", json={"history": history, "horizon_days": 7})
    assert r.status_code == 200
    body = r.json()
    assert len(body["forecast"]) == 7


def test_forecast_rejects_short_history() -> None:
    history = [{"ds": "2026-01-01", "y": 1}]
    r = client.post("/forecast", json={"history": history, "horizon_days": 7})
    assert r.status_code == 422  # pydantic min_length=14
