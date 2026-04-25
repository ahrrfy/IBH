"""PyOD-based anomaly detection over a 1D numeric series."""

from __future__ import annotations

import numpy as np


def detect_anomalies(
    series: list[float], contamination: float = 0.05
) -> tuple[list[int], list[float]]:
    """Return (indices, scores) of points flagged as anomalies.

    Uses Isolation Forest from PyOD when available; falls back to a
    median-absolute-deviation rule so the service still responds when
    heavy ML deps aren't installed (dev / CI without PyOD).
    """
    arr = np.asarray(series, dtype=float).reshape(-1, 1)
    try:
        from pyod.models.iforest import IForest

        model = IForest(contamination=contamination, random_state=42)
        model.fit(arr)
        labels = model.labels_
        scores = model.decision_scores_
        idx = [int(i) for i, x in enumerate(labels) if x == 1]
        return idx, [float(s) for s in scores]
    except ImportError:
        med = float(np.median(arr))
        mad = float(np.median(np.abs(arr - med))) or 1.0
        z = np.abs(arr.flatten() - med) / mad
        threshold = float(np.quantile(z, 1.0 - contamination))
        idx = [int(i) for i, v in enumerate(z) if v >= threshold]
        return idx, [float(v) for v in z]
