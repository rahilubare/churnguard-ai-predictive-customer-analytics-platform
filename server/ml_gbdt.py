import sys
import json
import numpy as np
import base64
import pickle
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.metrics import (
    accuracy_score,
    roc_auc_score,
    precision_score,
    recall_score,
    f1_score,
)


def _compute_metrics(model, X, y):
    """Compute the full metric suite on a given split."""
    if len(y) == 0:
        return {
            "accuracy": 0.0,
            "roc_auc": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
        }

    y_pred = model.predict(X)

    # roc_auc requires both classes present in y
    if len(np.unique(y)) > 1:
        y_proba = model.predict_proba(X)[:, 1]
        roc_auc = float(roc_auc_score(y, y_proba))
    else:
        roc_auc = 0.0

    return {
        "accuracy": float(accuracy_score(y, y_pred)),
        "roc_auc": roc_auc,
        # zero_division=0 avoids crashes when a class is never predicted
        "precision": float(precision_score(y, y_pred, zero_division=0)),
        "recall": float(recall_score(y, y_pred, zero_division=0)),
        "f1": float(f1_score(y, y_pred, zero_division=0)),
    }


def train(data):
    X = np.array(data["X"])
    y = np.array(data["y"])

    # Optional hyperparameters passed from the client (hyperparameter tuning)
    params = data.get("params", {}) or {}
    n_estimators = int(params.get("nEstimators", 100))
    max_depth = int(params.get("maxDepth", 3)) if params.get("maxDepth") is not None else 3
    learning_rate = float(params.get("learningRate", 0.1))

    # --- P0 FIX: Stratified train/test split ---
    # We split BEFORE any fitting. stratify=y keeps the churn ratio identical
    # in train and test, which matters a lot when the positive class is ~15-25%.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y if len(np.unique(y)) > 1 else None,
    )

    model = GradientBoostingClassifier(
        n_estimators=n_estimators,
        learning_rate=learning_rate,
        max_depth=max_depth,
        random_state=42,
    )
    model.fit(X_train, y_train)

    # --- P0 FIX: Evaluate on the held-out test set ONLY ---
    test_metrics = _compute_metrics(model, X_test, y_test)

    # --- P0 FIX: 5-fold stratified cross-validation on TRAIN ONLY ---
    # This gives an honest ±std on model stability without touching test.
    cv_metrics = {}
    if len(np.unique(y_train)) > 1 and len(y_train) >= 10:
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        # We need to re-instantiate the model per fold; cross_val_score clones it.
        cv_scores = cross_val_score(
            GradientBoostingClassifier(
                n_estimators=n_estimators,
                learning_rate=learning_rate,
                max_depth=max_depth,
                random_state=42,
            ),
            X_train,
            y_train,
            cv=cv,
            scoring="roc_auc",
        )
        cv_metrics = {
            "cv_roc_auc_mean": float(cv_scores.mean()),
            "cv_roc_auc_std": float(cv_scores.std()),
        }

    # Serialize
    model_b64 = base64.b64encode(pickle.dumps(model)).decode("utf-8")

    # NOTE on naming: keys are snake_case (matches your frontend ModelMetrics
    # if it was defined that way). If your TS type uses camelCase (rocAuc),
    # map them here. I'm keeping snake_case and letting the API layer map.
    metrics = {
        **test_metrics,
        **cv_metrics,
        "test_size": int(len(y_test)),
        "train_size": int(len(y_train)),
    }

    return {
        "model_json": model_b64,
        "feature_importances": model.feature_importances_.tolist(),
        "metrics": metrics,
    }


def predict(data):
    model_b64 = data["model_json"]
    X = np.array(data["X"])

    model_bytes = base64.b64decode(model_b64)
    model = pickle.loads(model_bytes)

    probabilities = model.predict_proba(X)
    return {"probabilities": probabilities[:, 1].tolist()}


if __name__ == "__main__":
    try:
        input_data = json.load(sys.stdin)
        command = input_data.get("command")
        payload = input_data.get("payload")

        if command == "train":
            result = train(payload)
            print(json.dumps({"success": True, "data": result}))
        elif command == "predict":
            result = predict(payload)
            print(json.dumps({"success": True, "data": result}))
        else:
            print(json.dumps({"success": False, "error": "Unknown command"}))

    except Exception as e:
        # Include traceback for real debugging; strip in prod if you prefer
        import traceback

        print(
            json.dumps(
                {
                    "success": False,
                    "error": str(e),
                    "trace": traceback.format_exc(),
                }
            )
        )