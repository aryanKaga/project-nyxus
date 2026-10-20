FROM python:3.10-slim

# Install system dependencies, Node.js 20.x, and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    git \
    build-essential \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g @lzehrung/codegraph@3.0.0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY requirements.txt package.json package-lock.json* ./

# Install Python and Node dependencies
RUN pip install --no-cache-dir -r requirements.txt \
    && npm install --omit=dev

# Copy application code
COPY server.py ./
COPY database/ ./database/
COPY ingestion/ ./ingestion/
COPY src/ ./src/

# Ensure workspace storage directory exists
RUN mkdir -p /app/workspaces

# Default environment configuration
ENV PYTHONUNBUFFERED=1 \
    NYXUS_HOST=0.0.0.0 \
    PORT=3000 \
    WORKSPACE_STORAGE=/app/workspaces

EXPOSE 3000

# Container liveness check
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://127.0.0.1:3000/health || exit 1

CMD ["uvicorn", "server:asgi_app", "--host", "0.0.0.0", "--port", "3000"]
