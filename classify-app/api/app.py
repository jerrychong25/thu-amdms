import json
from flask import Flask, request, abort
from src.model import TweeterClassifier

classifier = TweeterClassifier(model_dir="src/save")

app = Flask(__name__)

@app.route("/api/v1/classify", methods=["POST", "GET"])
def index():
    if request.method == "GET":
        return "Welcome to Disaster Classifier Model App!"

    if request.method == "POST":
        if not request.json:
            abort(400)
        tweet = request.json
        prediction = classifier.predict(tweet["tweet"])
        response = app.response_class(
            response=json.dumps(prediction), status=200, mimetype="application/json"
        )
        return response

if __name__ == "__main__":
    # Run App On 0.0.0.0 Port 5000
    app.run(host="0.0.0.0", port=5000)
