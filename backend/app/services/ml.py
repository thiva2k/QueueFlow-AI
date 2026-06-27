"""Service-time prediction model.

A small supervised regression model trained on a deterministic **synthetic**
dataset that models realistic patterns — counters run slower in the mid-morning
rush and late afternoon, and heavier queues drift longer. From three signals
(time of day, the service's nominal length, and the current queue load) it
predicts how long a service will take at the present hour, capturing structure a
flat average cannot.

The synthetic data is clearly labelled as such everywhere it surfaces
(`model_info()["data_source"] == "synthetic"`). Training is lazy (first use),
guarded by a lock, and cached; any failure (including scikit-learn being
unavailable or out-of-memory) is negatively cached so callers fall back to the
configured baseline instead of retraining on every request.
"""

import math
import random
import threading

# Feature order used in training AND prediction: [hour, nominal_duration, queue_length]
FEATURE_NAMES = ("time_of_day", "service_length", "queue_load")
_TRAINING_SAMPLES = 800

_model = None
_meta = {"trained": False, "samples": 0, "importances": {}, "available": True, "data_source": "synthetic"}
_lock = threading.Lock()


def _synthetic_history(n: int = _TRAINING_SAMPLES):
    """Deterministic synthetic service records with real-world-shaped patterns.

    These are invented (not observed) records; the shapes below are assumptions,
    not measurements — see the module docstring.
    """
    rng = random.Random(42)
    features, targets = [], []
    for _ in range(n):
        hour = rng.randint(8, 17)  # office hours, local time
        nominal = rng.choice([6, 8, 12])  # representative service lengths
        queue_length = rng.randint(0, 28)
        # Assumed mid-morning rush (~10am) + late-afternoon fatigue, heavier load drifts longer.
        hour_factor = 1.0 + 0.28 * math.exp(-((hour - 10) ** 2) / 6.0) + 0.16 * max(0, hour - 15) / 3.0
        load_factor = 1.0 + queue_length * 0.011
        noise = rng.gauss(1.0, 0.11)
        duration = max(1.0, nominal * hour_factor * load_factor * noise)
        features.append([hour, nominal, queue_length])
        targets.append(duration)
    return features, targets


def _train():
    """Train and cache the model. Any failure is negatively cached."""
    global _model, _meta
    try:
        from sklearn.ensemble import RandomForestRegressor

        features, targets = _synthetic_history()
        model = RandomForestRegressor(n_estimators=60, max_depth=8, random_state=42, n_jobs=1)
        model.fit(features, targets)
        importances = {name: round(float(value), 2) for name, value in zip(FEATURE_NAMES, model.feature_importances_)}
        _model = model
        _meta = {
            "trained": True,
            "samples": len(targets),
            "importances": importances,
            "available": True,
            "data_source": "synthetic",
        }
        return model
    except Exception:
        # sklearn missing, OOM during fit, etc. — degrade and stop retrying.
        _model = None
        _meta = {"trained": False, "samples": 0, "importances": {}, "available": False, "data_source": "synthetic"}
        return None


def get_model():
    if _model is not None or not _meta.get("available", True):
        return _model
    with _lock:  # serialize so concurrent first requests fit exactly one model
        if _model is None and _meta.get("available", True):
            _train()
    return _model


def predict_duration(nominal_minutes: float, hour: int, queue_length: int) -> float | None:
    """Model's estimate of how long this service will take at the given local hour."""
    model = get_model()
    if model is None:
        return None
    try:
        prediction = float(model.predict([[int(hour), float(nominal_minutes), int(queue_length)]])[0])
    except Exception:
        return None
    return max(prediction, 1.0)


def model_info() -> dict:
    """Metadata for explainability / the admin panel (includes data provenance)."""
    get_model()  # ensure trained (or marked unavailable)
    return dict(_meta)


def top_factor() -> str | None:
    """Human-readable name of the signal the model weighs most."""
    info = model_info()
    if not info.get("trained") or not info.get("importances"):
        return None
    label = {"time_of_day": "time of day", "service_length": "service type", "queue_load": "queue load"}
    best = max(info["importances"], key=info["importances"].get)
    return label.get(best, best)
