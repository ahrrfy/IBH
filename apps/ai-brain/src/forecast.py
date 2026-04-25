"""Prophet-based demand forecasting with a naive seasonal fallback."""

from __future__ import annotations

from typing import Any


def forecast_demand(history: list[dict[str, Any]], horizon: int) -> list[dict[str, Any]]:
    """Forecast `horizon` days ahead from a [{ds, y}] history.

    Tries Prophet first (Tier 2 production path); falls back to a
    7-day moving average so the endpoint remains useful when Prophet
    isn't installed.
    """
    if not history:
        raise ValueError("history is empty")

    try:
        import pandas as pd
        from prophet import Prophet

        df = pd.DataFrame(history)
        if not {"ds", "y"}.issubset(df.columns):
            raise ValueError("history rows must have 'ds' and 'y'")
        m = Prophet(daily_seasonality=False, weekly_seasonality=True)
        m.fit(df)
        future = m.make_future_dataframe(periods=horizon)
        f = m.predict(future).tail(horizon)
        return [
            {"ds": str(r.ds.date()), "yhat": float(r.yhat),
             "lower": float(r.yhat_lower), "upper": float(r.yhat_upper)}
            for r in f.itertuples()
        ]
    except ImportError:
        from datetime import date, timedelta

        ys = [float(r["y"]) for r in history]
        last_date = history[-1]["ds"]
        if isinstance(last_date, str):
            from datetime import datetime
            last_date = datetime.fromisoformat(last_date).date()
        window = ys[-7:] if len(ys) >= 7 else ys
        avg = sum(window) / len(window)
        return [
            {"ds": str(last_date + timedelta(days=i + 1)), "yhat": avg,
             "lower": avg * 0.8, "upper": avg * 1.2}
            for i in range(horizon)
        ]
