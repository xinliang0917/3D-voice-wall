import asyncio
import os
import re
import regex
import shutil
import subprocess
import tempfile
import time
import wave
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from funasr import AutoModel
from funasr.utils.postprocess_utils import rich_transcription_postprocess


MODEL_NAME = os.environ.get(
    "FUNASR_MODEL",
    "D:/funasr_cache/models/iic--SenseVoiceSmall/snapshots/master",
)
VAD_MODEL = os.environ.get("FUNASR_VAD_MODEL", "")
PORT = int(os.environ.get("FUNASR_PORT", "8000"))
DEVICE = os.environ.get("FUNASR_DEVICE", "cpu")
DEFAULT_LANGUAGE = os.environ.get("FUNASR_LANGUAGE", "auto")
MODEL_IS_SENSEVOICE = "SenseVoice" in MODEL_NAME or "sensevoice" in MODEL_NAME.lower()

try:
    torch.set_num_threads(8)
    torch.set_num_interop_threads(1)
except RuntimeError:
    pass

LANGUAGE_TAG_RE = re.compile(r"<\|(zh|en|ja|ko|yue|nospeech)\|>")
LANGUAGE_TAG_MAP = {
    "zh": "zh",
    "en": "en",
    "ja": "ja",
    "ko": "ko",
    "yue": "zh",
    "nospeech": "en",
}

model = None
last_timings = {}


def load_model():
    global model
    if model is not None:
        return model

    print(f"[funasr] loading {MODEL_NAME} on {DEVICE}...", flush=True)
    kwargs = {
        "model": MODEL_NAME,
        "trust_remote_code": True,
        "device": DEVICE,
        "disable_update": True,
    }
    if VAD_MODEL:
        kwargs["vad_model"] = VAD_MODEL
    model = AutoModel(**kwargs)
    print(f"[funasr] model loaded: {MODEL_NAME}", flush=True)
    return model


def extract_language(raw_text: str):
    match = LANGUAGE_TAG_RE.search(raw_text)
    return LANGUAGE_TAG_MAP.get(match.group(1)) if match else None


def postprocess_text(raw_text: str) -> str:
    if not raw_text:
        return ""
    if MODEL_IS_SENSEVOICE:
        try:
            text = rich_transcription_postprocess(raw_text)
            return remove_emoji(text)
        except Exception:
            return remove_emoji(re.sub(r"<\|[^|]+\|>", "", raw_text))
    return raw_text.strip()


def remove_emoji(text: str) -> str:
    if not text:
        return ""
    cleaned = regex.sub(r"\p{Extended_Pictographic}|\p{Emoji_Presentation}", "", text)
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def prepare_audio(data: bytes, suffix: str):
    temp_dir = tempfile.mkdtemp(prefix="funasr_")
    input_path = os.path.join(temp_dir, f"input{suffix or '.webm'}")
    output_path = os.path.join(temp_dir, "input.wav")
    with open(input_path, "wb") as audio_file:
        audio_file.write(data)

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-i",
                input_path,
                "-ar",
                "16000",
                "-ac",
                "1",
                "-af",
                "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2,areverse,"
                "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2,areverse",
                "-sample_fmt",
                "s16",
                output_path,
            ],
            check=True,
            capture_output=True,
        )
        return output_path, temp_dir

    if suffix.lower() == ".wav":
        return input_path, temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)
    raise HTTPException(status_code=500, detail="ffmpeg is required for non-wav audio")


def run_transcription(data: bytes, suffix: str, language: str | None, hotword: str | None):
    started_at = time.perf_counter()
    current_model = load_model()
    audio_path, temp_dir = prepare_audio(data, suffix)
    prepared_at = time.perf_counter()

    audio_seconds = 0.0
    try:
        with wave.open(audio_path, "rb") as audio_file:
            audio_seconds = audio_file.getnframes() / max(audio_file.getframerate(), 1)
    except Exception:
        pass

    try:
        generate_kwargs = {
            "input": audio_path,
            "use_itn": True,
            "batch_size_s": 300,
        }
        if hotword:
            generate_kwargs["hotword"] = hotword
        if MODEL_IS_SENSEVOICE:
            generate_kwargs["language"] = language or DEFAULT_LANGUAGE

        result = current_model.generate(**generate_kwargs)
        inferred_at = time.perf_counter()
        raw_text = result[0].get("text", "") if result else ""
        global last_timings
        last_timings = {
            "audio_seconds": round(audio_seconds, 3),
            "ffmpeg_seconds": round(prepared_at - started_at, 3),
            "inference_seconds": round(inferred_at - prepared_at, 3),
            "total_seconds": round(inferred_at - started_at, 3),
        }
        print(
            f"[funasr] audio={last_timings['audio_seconds']}s "
            f"ffmpeg={last_timings['ffmpeg_seconds']}s "
            f"inference={last_timings['inference_seconds']}s "
            f"total={last_timings['total_seconds']}s",
            flush=True,
        )
        return {
            "text": postprocess_text(raw_text),
            "language": extract_language(raw_text),
        }
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await asyncio.to_thread(load_model)
    yield


app = FastAPI(title="FunASR Voice Wall Server", lifespan=lifespan)


@app.get("/")
async def health_check():
    return {"status": "healthy", "message": "ASR service running", "model": MODEL_NAME}


@app.get("/api/stats")
async def stats():
    return JSONResponse(content=last_timings)


@app.post("/v1/audio/transcriptions")
async def openai_transcriptions(
    file: UploadFile = File(...),
    model: str | None = Form(None),
    language: str | None = Form(None),
    response_format: str | None = Form(None),
    temperature: float | None = Form(None),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio file")

    suffix = Path(file.filename or "audio.webm").suffix
    result = await asyncio.to_thread(
        run_transcription,
        data,
        suffix,
        language,
        None,
    )
    return JSONResponse(
        content={
            "text": result["text"],
            "language": result["language"],
        }
    )


@app.post("/asr")
async def legacy_asr(
    file: UploadFile = File(...),
    batch_size_s: int = Form(300),
    hotword: str | None = Form(None),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio file")

    suffix = Path(file.filename or "audio.webm").suffix
    result = await asyncio.to_thread(
        run_transcription,
        data,
        suffix,
        DEFAULT_LANGUAGE,
        hotword,
    )
    return JSONResponse(
        content={
            "status": "success",
            "filename": file.filename,
            "transcription": result["text"],
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
