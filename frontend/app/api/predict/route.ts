const DEFAULT_API_URL = "https://yolo.nexa.com.ai/predict"
const MAX_FILE_SIZE = 10 * 1024 * 1024

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const incoming = await request.formData()
    const file = incoming.get("file")

    if (!(file instanceof File)) {
      return Response.json(
        { error: "An image file is required." },
        { status: 400 }
      )
    }
    if (!file.type.startsWith("image/")) {
      return Response.json(
        { error: "Only image uploads are supported." },
        { status: 415 }
      )
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: "The image must be 10 MB or smaller." },
        { status: 413 }
      )
    }

    const body = new FormData()
    body.append("file", file, file.name)
    const upstream = await fetch(process.env.YOLO_API_URL || DEFAULT_API_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    })

    const responseBody = await upstream.text()
    const contentType =
      upstream.headers.get("content-type") || "application/json"
    if (!upstream.ok) {
      let message = "The detection service could not process this image."
      try {
        const parsed = JSON.parse(responseBody) as {
          detail?: unknown
          error?: unknown
        }
        message = String(parsed.detail || parsed.error || message)
      } catch {
        // Keep the user-facing fallback when the upstream response is not JSON.
      }
      return Response.json({ error: message }, { status: upstream.status })
    }

    return new Response(responseBody, {
      status: upstream.status,
      headers: { "content-type": contentType },
    })
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The detection service took too long to respond. Please try again."
        : "The detection service is currently unavailable. Please try again shortly."
    return Response.json({ error: message }, { status: 502 })
  }
}
