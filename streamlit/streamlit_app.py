import streamlit as st
from PIL import Image
from ultralytics import YOLO

st.title("YOLO11n Detection")

@st.cache_resource
def load_model():
    return YOLO("yolo11n.pt")

model = load_model()

image_file = st.file_uploader(
    "Upload an image",
    type=["jpg", "jpeg", "png"]
)

if image_file:
    image = Image.open(image_file).convert("RGB")

    confidence = st.slider(
        "Confidence",
        0.0, 1.0, 0.25, 0.05
    )

    result = model.predict(
        image,
        conf=confidence,
        imgsz=640,
        verbose=False
    )[0]

    # result.plot() returns BGR
    annotated = result.plot()[..., ::-1]

    st.image(
        annotated,
        caption=f"Detected objects: {len(result.boxes)}",
        width="stretch"
    )