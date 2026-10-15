"""gunicorn, as supervisord runs it in the container (docker/bin/start-gunicorn).

Only Nginx talks to it, over loopback; Nginx also buffers uploads and slow
clients, which is what lets plain sync workers do the job.
"""
import os

bind = "127.0.0.1:8000"

# Each worker is a whole Django process (roughly 60-80 MB). Three keep a
# gym's traffic moving on a small server; WEB_CONCURRENCY raises it.
workers = int(os.environ.get("WEB_CONCURRENCY", "3"))
timeout = 60
graceful_timeout = 20

# Recycle each worker after a while, so nothing can creep upward forever.
max_requests = 1000
max_requests_jitter = 100

# Load Django once, before forking: faster restarts, shared memory.
preload_app = True
worker_tmp_dir = "/dev/shm"

# Nginx already logs every request; this log is for errors.
accesslog = None
errorlog = "-"
loglevel = "info"

# supervisord starts, stops and restarts gunicorn; its own control socket
# would only fail to find a writable home directory.
control_socket_disable = True
