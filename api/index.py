from io import BytesIO
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, UploadFile
from PIL import Image
from ultralytics import YOLO

app = FastAPI()

MODEL_PATH = Path(__file__).resolve().parents[1] / "yolo11n.pt"
model = YOLO(str(MODEL_PATH))


@app.get("/api")
def home():
    return {"message": "YOLO API is running"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    image = Image.open(BytesIO(await file.read())).convert("RGB")

    result = model.predict(
        source=np.array(image),
        conf=0.25,
        imgsz=640,
        device="cpu",
        verbose=False
    )[0]

    detections = []

    for box in result.boxes:
        class_id = int(box.cls.item())

        detections.append({
            "class": result.names[class_id],
            "confidence": round(float(box.conf.item()), 4),
            "box": [round(value, 2) for value in box.xyxy[0].tolist()]
        })

    return {"detections": detections}