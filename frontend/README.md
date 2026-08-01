# Nexa Vision frontend

A Next.js interface for uploading an image, sending it to the YOLO prediction API, reviewing detections, and downloading an annotated PNG.

## Development

```sh
npm install
npm run dev
```

The browser posts images to the local `/api/predict` route. That route proxies requests to `https://yolo.nexa.com.ai/predict` by default, avoiding cross-origin issues.

To use a different prediction service, set a server-side environment variable:

```sh
YOLO_API_URL=http://localhost:8000/predict npm run dev
```
