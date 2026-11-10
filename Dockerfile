FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 \
        ffmpeg \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Optimize threading memory for containers
ENV OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    VECLIB_MAXIMUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    PORT=8000

# Upgrade pip and install CPU torch wheels
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        torch torchaudio

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Download trained checkpoints during build so container starts instantly
RUN python scripts/download_weights.py

EXPOSE 8000

CMD ["sh", "-c", "python server.py --host 0.0.0.0 --port ${PORT:-8000}"]
