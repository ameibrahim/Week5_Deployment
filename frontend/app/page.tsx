"use client"

import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  ArrowRight,
  Check,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react"

type Detection = {
  class_id: number
  class: string
  confidence: number
  box: [number, number, number, number]
}

type ImageSize = { width: number; height: number }

const MAX_FILE_SIZE = 10 * 1024 * 1024
const BOX_COLORS = ["#f25f4b", "#e0a225", "#178b80", "#4d71db", "#b65492"]

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function colorForClass(classId: number) {
  return BOX_COLORS[Math.abs(classId) % BOX_COLORS.length]
}

function validateDetections(value: unknown): Detection[] {
  if (!value || typeof value !== "object" || !("detections" in value)) {
    throw new Error("The detection service returned an unexpected response.")
  }

  const detections = (value as { detections: unknown }).detections
  if (!Array.isArray(detections)) {
    throw new Error("The detection service returned an unexpected response.")
  }

  return detections.filter((item): item is Detection => {
    if (!item || typeof item !== "object") return false
    const detection = item as Partial<Detection>
    return (
      typeof detection.class_id === "number" &&
      typeof detection.class === "string" &&
      typeof detection.confidence === "number" &&
      Array.isArray(detection.box) &&
      detection.box.length === 4 &&
      detection.box.every((coordinate) => typeof coordinate === "number")
    )
  })
}

export default function Page() {
  const inputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [detections, setDetections] = useState<Detection[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showBoxes, setShowBoxes] = useState(true)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const selectFile = useCallback(
    (nextFile: File | undefined) => {
      if (!nextFile) return
      if (!nextFile.type.startsWith("image/")) {
        setError("Choose a JPG, PNG, or WEBP image.")
        return
      }
      if (nextFile.size > MAX_FILE_SIZE) {
        setError("That image is larger than 10 MB. Choose a smaller file.")
        return
      }

      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setFile(nextFile)
      setPreviewUrl(URL.createObjectURL(nextFile))
      setImageSize(null)
      setDetections([])
      setShowBoxes(true)
      setHasAnalyzed(false)
      setError(null)
    },
    [previewUrl]
  )

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0])
    event.target.value = ""
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    selectFile(event.dataTransfer.files?.[0])
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(null)
    setPreviewUrl(null)
    setImageSize(null)
    setDetections([])
    setError(null)
    setShowBoxes(true)
    setHasAnalyzed(false)
  }

  async function analyzeImage() {
    if (!file) return
    setIsAnalyzing(true)
    setHasAnalyzed(false)
    setError(null)
    setDetections([])

    try {
      const body = new FormData()
      body.append("file", file)
      const response = await fetch("/api/predict", { method: "POST", body })
      const payload: unknown = await response.json().catch(() => null)

      if (!response.ok) {
        const detail =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "The detection service could not process this image."
        throw new Error(detail)
      }

      setDetections(validateDetections(payload))
      setHasAnalyzed(true)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Something went wrong while analyzing the image."
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  function downloadAnnotatedImage() {
    const image = imageRef.current
    if (!image || !imageSize) return

    const canvas = document.createElement("canvas")
    canvas.width = imageSize.width
    canvas.height = imageSize.height
    const context = canvas.getContext("2d")
    if (!context) return

    context.drawImage(image, 0, 0, imageSize.width, imageSize.height)
    const scale = Math.max(1, imageSize.width / 900)
    context.lineWidth = 3 * scale
    context.font = `600 ${14 * scale}px Inter, sans-serif`
    context.textBaseline = "top"

    detections.forEach((detection) => {
      const [x1, y1, x2, y2] = detection.box
      const color = colorForClass(detection.class_id)
      const label = `${detection.class} ${Math.round(detection.confidence * 100)}%`
      const paddingX = 7 * scale
      const paddingY = 5 * scale
      const labelWidth = context.measureText(label).width + paddingX * 2
      const labelHeight = 24 * scale
      const labelY = y1 >= labelHeight ? y1 - labelHeight : y1

      context.strokeStyle = color
      context.strokeRect(x1, y1, x2 - x1, y2 - y1)
      context.fillStyle = color
      context.fillRect(x1, labelY, labelWidth, labelHeight)
      context.fillStyle = "#ffffff"
      context.fillText(label, x1 + paddingX, labelY + paddingY)
    })

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      const baseName = file?.name.replace(/\.[^.]+$/, "") || "detection"
      link.href = url
      link.download = `${baseName}-annotated.png`
      link.click()
      URL.revokeObjectURL(url)
    }, "image/png")
  }

  const classSummary = useMemo(() => {
    const counts = new Set(detections.map((detection) => detection.class))
    return counts.size
  }, [detections])

  const hasResult = hasAnalyzed && detections.length > 0
  const emptyResult = hasAnalyzed && detections.length === 0

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-[#192324]">
      <header className="relative z-20 bg-white/95 shadow-[0_1px_0_rgba(19,51,48,0.08)] backdrop-blur">
        <div className="flex h-1 w-full" aria-hidden="true">
          <span className="flex-1 bg-[#ff6b58]" />
          <span className="flex-1 bg-[#f4c84a]" />
          <span className="flex-1 bg-[#25a996]" />
          <span className="flex-1 bg-[#6673e8]" />
          <span className="flex-1 bg-[#d35b9d]" />
        </div>
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-[#173f3a] text-[#ffe16a] shadow-[4px_4px_0_#ff735f]">
              <ScanSearch className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[15px] leading-tight font-semibold">
                Nexa Vision
              </p>
              <p className="text-[11px] font-medium tracking-[0.14em] text-[#6d7774] uppercase">
                Object detection
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[#e8f7f1] px-3 py-1.5 text-xs font-semibold text-[#176c5f]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#279478] opacity-50" />
              <span className="relative inline-flex size-2 rounded-full bg-[#24866f]" />
            </span>
            API ready
          </div>
        </div>
      </header>

      <section className="bg-[#124c46] text-white">
        <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-8 px-5 pt-11 pb-24 sm:px-8 sm:pt-14 sm:pb-28 lg:flex-row lg:items-end lg:px-12">
          <div className="flex max-w-3xl flex-col gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-[#ffe16a] uppercase">
              <Sparkles className="size-4" aria-hidden="true" /> YOLO-powered
              analysis
            </div>
            <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold sm:text-5xl">
              Turn any image into{" "}
              <span className="text-[#ff806d]">visible insight.</span>
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-white/75 sm:text-base">
              Upload a photo to detect and locate objects. Review every
              prediction, then export the annotated result.
            </p>
          </div>
          <div className="hidden items-end gap-2 lg:flex" aria-hidden="true">
            <span className="h-16 w-5 rounded-sm bg-[#ff735f]" />
            <span className="h-24 w-5 rounded-sm bg-[#ffe16a]" />
            <span className="h-12 w-5 rounded-sm bg-[#65d5c2]" />
            <span className="h-20 w-5 rounded-sm bg-[#7782f0]" />
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-14 max-w-[1440px] px-5 pb-14 sm:px-8 lg:px-12">
        <div className="grid min-h-[610px] overflow-hidden rounded-lg bg-white shadow-[0_24px_70px_rgba(17,50,47,0.16)] ring-1 ring-black/5 lg:grid-cols-[minmax(0,1fr)_350px]">
          <section className="flex min-w-0 flex-col lg:border-r lg:border-[#e7e9ee]">
            <div className="flex min-h-16 items-center justify-between bg-[#f7f9ff] px-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-md bg-[#dfe5ff] text-xs font-bold text-[#4a58c9]">
                  1
                </span>
                <h2 className="text-sm font-semibold">Image workspace</h2>
              </div>
              {file && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex size-9 items-center justify-center rounded-md text-[#66716e] transition-all hover:-rotate-12 hover:bg-[#e8ecf8] hover:text-[#17201e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#26796d]"
                  title="Start over"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  <span className="sr-only">Start over</span>
                </button>
              )}
            </div>

            <div className="flex flex-1 flex-col p-4 sm:p-7">
              {!previewUrl ? (
                <div
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (
                      !event.currentTarget.contains(event.relatedTarget as Node)
                    )
                      setIsDragging(false)
                  }}
                  onDrop={handleDrop}
                  className={`upload-pattern group relative flex min-h-[440px] flex-1 flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed px-6 text-center transition-all duration-300 sm:min-h-[500px] ${isDragging ? "scale-[1.01] border-[#fa6e59] bg-[#fff3ee] shadow-[0_18px_40px_rgba(250,110,89,0.14)]" : "border-[#b8c2dd] bg-[#f9faff] hover:border-[#6978df] hover:shadow-[0_18px_40px_rgba(74,88,201,0.10)]"}`}
                >
                  <span
                    className="absolute top-8 left-8 h-12 w-3 rounded-sm bg-[#ff735f] opacity-80 transition-transform group-hover:-translate-y-1"
                    aria-hidden="true"
                  />
                  <span
                    className="absolute top-8 left-13 h-8 w-3 rounded-sm bg-[#ffe16a] opacity-90 transition-transform group-hover:translate-y-1"
                    aria-hidden="true"
                  />
                  <span
                    className="absolute right-8 bottom-8 size-8 rotate-12 rounded-md border-4 border-[#69cdbd] opacity-70 transition-transform group-hover:rotate-45"
                    aria-hidden="true"
                  />
                  <span className="relative mb-6 grid size-20 place-items-center rounded-lg bg-[#5967d7] text-white shadow-[8px_8px_0_#ffd85c] transition-transform duration-300 group-hover:-translate-y-1">
                    <ImagePlus className="size-9" aria-hidden="true" />
                  </span>
                  <h3 className="text-xl font-semibold">
                    Drop your image here
                  </h3>
                  <p className="mt-2 text-sm text-[#707a77]">
                    JPG, PNG, or WEBP up to 10 MB
                  </p>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#ff6b58] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(255,107,88,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#ed5746] hover:shadow-[0_11px_24px_rgba(255,107,88,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5967d7]"
                  >
                    <Upload className="size-4" aria-hidden="true" /> Choose
                    image
                  </button>
                  <p className="mt-4 text-xs text-[#929a97]">
                    or drag and drop from your device
                  </p>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-4">
                  <div className="relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden rounded-lg bg-[#152928] shadow-inner sm:min-h-[460px]">
                    <div className="relative max-h-full max-w-full leading-none">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        ref={imageRef}
                        src={previewUrl}
                        alt={
                          file ? `Preview of ${file.name}` : "Uploaded image"
                        }
                        onLoad={(event) =>
                          setImageSize({
                            width: event.currentTarget.naturalWidth,
                            height: event.currentTarget.naturalHeight,
                          })
                        }
                        className="block max-h-[540px] max-w-full object-contain"
                      />
                      {imageSize && showBoxes && detections.length > 0 && (
                        <svg
                          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
                          className="pointer-events-none absolute inset-0 size-full"
                          aria-label={`${detections.length} detected objects`}
                        >
                          {detections.map((detection, index) => {
                            const [x1, y1, x2, y2] = detection.box
                            const color = colorForClass(detection.class_id)
                            const label = `${detection.class} ${Math.round(detection.confidence * 100)}%`
                            const fontSize = Math.max(13, imageSize.width / 75)
                            const labelHeight = fontSize * 1.75
                            const labelWidth = Math.max(
                              fontSize * 5,
                              label.length * fontSize * 0.62 + fontSize
                            )
                            const labelY =
                              y1 > labelHeight ? y1 - labelHeight : y1
                            return (
                              <g key={`${detection.class}-${index}`}>
                                <rect
                                  x={x1}
                                  y={y1}
                                  width={Math.max(0, x2 - x1)}
                                  height={Math.max(0, y2 - y1)}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth={Math.max(
                                    3,
                                    imageSize.width / 350
                                  )}
                                  vectorEffect="non-scaling-stroke"
                                />
                                <rect
                                  x={x1}
                                  y={labelY}
                                  width={labelWidth}
                                  height={labelHeight}
                                  fill={color}
                                />
                                <text
                                  x={x1 + fontSize * 0.5}
                                  y={labelY + fontSize * 1.24}
                                  fill="white"
                                  fontSize={fontSize}
                                  fontWeight="600"
                                >
                                  {label}
                                </text>
                              </g>
                            )
                          })}
                        </svg>
                      )}
                    </div>
                    {isAnalyzing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#17201e]/80 text-white backdrop-blur-[2px]">
                        <LoaderCircle
                          className="size-8 animate-spin"
                          aria-hidden="true"
                        />
                        <p className="mt-4 text-sm font-semibold">
                          Analyzing image...
                        </p>
                        <p className="mt-1 text-xs text-white/60">
                          Locating objects and scoring predictions
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between gap-3 rounded-lg bg-[#f3f6ff] px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {file?.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[#79827f]">
                        {file && formatBytes(file.size)}
                        {imageSize &&
                          `  ·  ${imageSize.width} × ${imageSize.height}px`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {detections.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowBoxes((current) => !current)}
                          className="inline-flex size-10 items-center justify-center rounded-lg bg-white text-[#4c59c2] shadow-sm ring-1 ring-[#dfe3f4] transition-all hover:-translate-y-0.5 hover:bg-[#eef1ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5967d7]"
                          title={
                            showBoxes ? "Hide annotations" : "Show annotations"
                          }
                        >
                          {showBoxes ? (
                            <Eye className="size-4" aria-hidden="true" />
                          ) : (
                            <EyeOff className="size-4" aria-hidden="true" />
                          )}
                          <span className="sr-only">
                            {showBoxes
                              ? "Hide annotations"
                              : "Show annotations"}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-[#34433f] shadow-sm ring-1 ring-[#dfe3f4] transition-all hover:-translate-y-0.5 hover:bg-[#eef1ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5967d7]"
                      >
                        <ImagePlus className="size-4" aria-hidden="true" />{" "}
                        Replace
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-3 rounded-lg bg-[#fff0eb] px-4 py-3 text-sm text-[#963c2e] ring-1 ring-[#ffc9bd]"
                >
                  <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-[480px] flex-col bg-[#fffaf0]">
            <div className="flex min-h-16 items-center gap-2.5 bg-[#fff3d2] px-5">
              <span className="grid size-7 place-items-center rounded-md bg-[#ffd65c] text-xs font-bold text-[#684e00]">
                2
              </span>
              <h2 className="text-sm font-semibold">Detection results</h2>
            </div>

            <div className="flex flex-1 flex-col p-5">
              {!file ? (
                <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
                  <span className="grid size-16 place-items-center rounded-lg bg-[#ffe6a0] text-[#9a7000] shadow-[6px_6px_0_#ffc2b7]">
                    <ScanSearch
                      className="size-8"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-[#4f5b58]">
                    Waiting for an image
                  </p>
                  <p className="mt-1 max-w-[220px] text-xs leading-5 text-[#818a87]">
                    Your detections and confidence scores will appear here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-[#e4f6f1] p-4 text-[#12695d]">
                      <p className="text-3xl font-bold tabular-nums">
                        {detections.length}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#477a72]">
                        Objects found
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#e9ecff] p-4 text-[#4654bc]">
                      <p className="text-3xl font-bold tabular-nums">
                        {classSummary}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#6973ad]">
                        Unique classes
                      </p>
                    </div>
                  </div>

                  {hasResult ? (
                    <div className="mt-5 flex-1">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold tracking-[0.12em] text-[#69736f] uppercase">
                          Identified
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#26796d]">
                          <Check className="size-3.5" aria-hidden="true" />{" "}
                          Complete
                        </span>
                      </div>
                      <div className="max-h-[310px] space-y-2 overflow-y-auto pr-1">
                        {detections.map((detection, index) => (
                          <div
                            key={`${detection.class}-${index}`}
                            className="flex items-center gap-3 rounded-lg bg-white px-3 py-3 shadow-[0_3px_12px_rgba(66,53,15,0.06)] ring-1 ring-[#f0e8d5] transition-transform hover:translate-x-1"
                          >
                            <span
                              className="h-8 w-1 shrink-0 rounded-full"
                              style={{
                                backgroundColor: colorForClass(
                                  detection.class_id
                                ),
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold capitalize">
                                {detection.class}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#8a9290]">
                                Object {index + 1}
                              </p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums">
                              {Math.round(detection.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : emptyResult ? (
                    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                      <span className="grid size-14 place-items-center rounded-lg bg-[#e4f6f1] text-[#238271]">
                        <ShieldCheck
                          className="size-7"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </span>
                      <p className="mt-4 text-sm font-semibold">
                        No objects detected
                      </p>
                      <p className="mt-1 max-w-[230px] text-xs leading-5 text-[#818a87]">
                        Try another image with clearer, well-lit subjects.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                      <p className="text-sm font-semibold text-[#596561]">
                        Ready to analyze
                      </p>
                      <p className="mt-1 max-w-[230px] text-xs leading-5 text-[#818a87]">
                        Run detection to identify objects in this image.
                      </p>
                    </div>
                  )}

                  <div className="mt-5 space-y-2 border-t border-[#eadfca] pt-5">
                    {hasResult ? (
                      <button
                        type="button"
                        onClick={downloadAnnotatedImage}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#5967d7] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(89,103,215,0.24)] transition-all hover:-translate-y-0.5 hover:bg-[#4857c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6b58]"
                      >
                        <Download className="size-4" aria-hidden="true" />{" "}
                        Download annotated image
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={analyzeImage}
                        disabled={isAnalyzing}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#ff6b58] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(255,107,88,0.24)] transition-all hover:-translate-y-0.5 hover:bg-[#ed5746] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5967d7] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isAnalyzing ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <ArrowRight className="size-4" aria-hidden="true" />
                        )}
                        {isAnalyzing
                          ? "Analyzing..."
                          : error
                            ? "Try again"
                            : "Run detection"}
                      </button>
                    )}
                    <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-[#89918e]">
                      <ShieldCheck className="size-3.5" aria-hidden="true" />{" "}
                      Images are processed securely
                    </p>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInput}
        className="sr-only"
      />
    </main>
  )
}
