"""
Al-Ruya AI Brain — Tier 2/3 service.

Tier 2 (always-on, ~2 GB):
  - PyOD anomaly detection on transactions
  - Prophet demand forecasting per variant
Tier 1 (lazy, ~5 % of cases):
  - Qwen 7B via Ollama for free-form NLP/SQL queries
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .anomaly import detect_anomalies
from .forecast import forecast_demand


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Lazy load happens inside individual endpoints; nothing eager here.
    yield


app = FastAPI(
    title="Al-Ruya AI Brain",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-brain"}


class AnomalyRequest(BaseModel):
    series: list[float] = Field(..., min_length=10, description="numeric series, e.g. daily totals")
    contamination: float = Field(0.05, ge=0.001, le=0.5)


class AnomalyResponse(BaseModel):
    anomaly_indices: list[int]
    scores: list[float]


@app.post("/anomaly", response_model=AnomalyResponse)
def anomaly(req: AnomalyRequest) -> AnomalyResponse:
    indices, scores = detect_anomalies(req.series, contamination=req.contamination)
    return AnomalyResponse(anomaly_indices=indices, scores=scores)


class ForecastRequest(BaseModel):
    history: list[dict[str, Any]] = Field(
        ..., description="[{ds: 'YYYY-MM-DD', y: number}, ...]", min_length=14,
    )
    horizon_days: int = Field(30, ge=1, le=365)


class ForecastResponse(BaseModel):
    forecast: list[dict[str, Any]]


@app.post("/forecast", response_model=ForecastResponse)
def forecast(req: ForecastRequest) -> ForecastResponse:
    try:
        out = forecast_demand(req.history, horizon=req.horizon_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ForecastResponse(forecast=out)
