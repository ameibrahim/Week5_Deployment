from io import BytesIO

import numpy as np
from fastapi import FastAPI, File, UploadFile
from PIL import Image
from ultralytics import YOLO

app = FastAPI()
model = YOLO("yolo11n.pt")


# url/predict
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    image = Image.open(BytesIO(await file.read())).convert("RGB")

    result = model.predict(
        source=np.array(image),
        imgsz=640,
        conf=0.25,
        verbose=False
    )[0]

    detections = []

    for box in result.boxes:
        class_id = int(box.cls[0])

        detections.append({
            "class_id": class_id,
            "class": result.names[class_id],
            "confidence": round(float(box.conf[0]), 4),
            "box": [round(x, 2) for x in box.xyxy[0].tolist()]
        })

    return {"detections": detections}