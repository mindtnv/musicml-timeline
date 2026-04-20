# Multi-stage build for musicml-timeline inference API.
# Targets CPU-only deployment on a small VPS (4 vCPU / 4-8 GB RAM).

ARG PYTHON_VERSION=3.12

# ---------- builder ----------
FROM python:${PYTHON_VERSION}-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install torch CPU-only first (largest, cache-friendly layer).
# pytorch.org/whl/cpu serves ~200 MB wheels vs ~2.2 GB for CUDA ones.
RUN pip install --index-url https://download.pytorch.org/whl/cpu \
        "torch>=2.1"

COPY pyproject.toml README.md* ./
COPY musicml ./musicml

# Install the package with web + ast extras. transformers pulls HF hub +
# tokenizers; panns is excluded — the deployed model is AST, not PANNs.
RUN pip install ".[web,ast]"

# ---------- runner ----------
FROM python:${PYTHON_VERSION}-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # HuggingFace cache inside the image is baked by bake-hf-cache stage;
    # at runtime we still allow overriding via a volume mount.
    HF_HOME=/app/.cache/huggingface \
    TRANSFORMERS_OFFLINE=0 \
    # Limit torch intra-op threads so two concurrent inferences don't thrash
    # a 4-vCPU VPS. Override at runtime if you have more cores.
    OMP_NUM_THREADS=4 \
    MKL_NUM_THREADS=4

RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for the runtime.
RUN useradd --create-home --uid 1000 musicml

WORKDIR /app

# Copy installed Python site-packages + the musicml source tree.
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY --chown=musicml:musicml musicml ./musicml
COPY --chown=musicml:musicml configs ./configs
COPY --chown=musicml:musicml scripts ./scripts

# Runtime volumes — must be writable by the musicml user.
RUN mkdir -p /app/cache /app/uploads /app/checkpoints /app/.cache/huggingface \
    && chown -R musicml:musicml /app

USER musicml

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["python", "scripts/serve_ml.py"]
