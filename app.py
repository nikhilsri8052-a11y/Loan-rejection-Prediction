from flask import Flask, render_template, request, jsonify
import os
import pickle
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline

app = Flask(__name__)

MODEL_PATH = "loan_rejection_model.pkl"
FEATURE_COLUMNS = [
    "age", "income", "loanAmount", "creditScore", "employmentYears", 
    "dependents", "debtToIncomeRatio", "hasHomeOwnership", "hasExistingDebts",
    "employmentType", "loanPurpose", "monthlyPayment", "savingsAccount"
]


def train_model():
    df = pd.read_csv("framingham.csv")
    X = df[FEATURE_COLUMNS]
    y = df["LoanRejection"]

    X_train, _, y_train, _ = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = make_pipeline(
        SimpleImputer(strategy="median"),
        RandomForestClassifier(n_estimators=120, max_depth=10, random_state=42)
    )
    model.fit(X_train, y_train)

    with open(MODEL_PATH, "wb") as file:
        pickle.dump(model, file)

    return model


def load_model():
    if not os.path.exists(MODEL_PATH):
        return train_model()

    try:
        with open(MODEL_PATH, "rb") as file:
            return pickle.load(file)
    except Exception as e:
        # Fall back to retraining the model when the pickle cannot be loaded
        # This commonly happens when scikit-learn versions differ between
        # the environment that saved the model and the current runtime.
        print(f"Failed to load saved model ({e}); retraining instead.")
        return train_model()


model = load_model()


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    form_data = {}
    for column in FEATURE_COLUMNS:
        value = request.form.get(column, "")
        if value == "":
            form_data[column] = 0
        else:
            form_data[column] = float(value)

    data = pd.DataFrame([form_data], columns=FEATURE_COLUMNS)
    probability = float(model.predict_proba(data)[0, 1])
    risk_level = "High Risk" if probability >= 0.5 else "Low Risk"
    probability_percent = probability * 100
    prediction_text = f"Rejection Probability: {probability_percent:.1f}% ({risk_level})"
    result = {
        "success": True,
        "rejection_probability": probability_percent,
        "risk_probability": probability,
        "risk_level": risk_level,
        "prediction_text": prediction_text,
    }

    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify(result)

    return render_template(
        "index.html",
        prediction_text=prediction_text,
        risk_probability=probability,
        risk_level=risk_level,
        flask_result=result,
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
