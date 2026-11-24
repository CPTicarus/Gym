# The whole gym app in one image: the React frontend, the Django backend
# compiled to native code, Nginx in front of it and Postgres beside it, all
# run by supervisord. DEPLOY.md has the full story; the short one is
#
#   docker build -t gym .
#
# The build runs the test suite against the compiled code and stops if it
# fails. --build-arg SKIP_TESTS=1 skips that while you're iterating.

ARG PYTHON_IMAGE=python:3.13-slim-trixie
ARG NODE_IMAGE=node:22-trixie-slim


# ---- frontend: the production bundle ---------------------------------------
FROM ${NODE_IMAGE} AS frontend
WORKDIR /front
COPY front/package.json front/package-lock.json ./
RUN npm ci --no-audit --no-fund --fetch-retries=5
COPY front/ ./
# Nginx serves the bundle and the API from one origin, so it calls /api.
ENV VITE_API_BASE_URL=/api
RUN npm run build


# ---- backend: dependencies, then the app compiled to native modules -------
FROM ${PYTHON_IMAGE} AS backend
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PIP_RETRIES=10 \
    PIP_DEFAULT_TIMEOUT=60 \
    PYTHONDONTWRITEBYTECODE=1
RUN echo 'Acquire::Retries "10";' > /etc/apt/apt.conf.d/80-retries \
 && apt-get update \
 && apt-get install -y --no-install-recommends gcc libc6-dev \
 && rm -rf /var/lib/apt/lists/*
# The compiler toolchain lives outside the venv, so none of it ships.
RUN pip install Cython==3.2.9 setuptools==84.0.0
COPY requirements.txt docker/constraints.txt /tmp/
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install -r /tmp/requirements.txt gunicorn supervisor -c /tmp/constraints.txt

WORKDIR /src
COPY gym_backend/ gym_backend/
COPY apps/ apps/
ENV DJANGO_SETTINGS_MODULE=gym_backend.settings.container
# The migrations ship inside the image, so they have to match the models
# exactly: better a failed build here than a crash on the server. (There's
# no database to check the history against yet, hence the -W.)
RUN SECRET_KEY=build-time-only /opt/venv/bin/python -W ignore::RuntimeWarning \
        -m django makemigrations --check --dry-run
# The tests stay source, set aside for the test stage below. They never ship.
RUN mkdir /tests \
 && find apps -name tests.py -exec cp --parents {} /tests/ \; \
 && find apps -name tests.py -delete
COPY docker/compile.py /tmp/compile.py
RUN python /tmp/compile.py /src apps gym_backend
# The first imports of the compiled code, the way the server will do them.
RUN export SECRET_KEY=build-time-only \
 && /opt/venv/bin/python -m django check \
 && /opt/venv/bin/python -m django collectstatic --noinput --verbosity=0


# ---- runtime: what ships ----------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime
ENV PATH=/opt/gym/bin:/opt/venv/bin:/usr/lib/postgresql/17/bin:$PATH \
    DJANGO_SETTINGS_MODULE=gym_backend.settings.container \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Fixed ids, so the files in the data volume keep their owners when the
# image is rebuilt or upgraded.
RUN groupadd --system --gid 999 postgres \
 && useradd --system --uid 999 --gid postgres --home-dir /var/lib/postgresql --shell /bin/bash postgres \
 && groupadd --system --gid 10001 gym \
 && useradd --system --uid 10001 --gid gym --home-dir /app --no-create-home --shell /usr/sbin/nologin gym

# Postgres without Debian's own cluster -- the entrypoint makes one in the
# data volume -- and without LLVM, which only its JIT uses (switched off in
# docker/postgresql.conf). That's about 175 MB the image doesn't carry.
RUN printf '%s\n' \
        'path-exclude=/usr/lib/*/libLLVM*' \
        'path-exclude=/usr/lib/*/libz3*' \
        'path-exclude=/usr/lib/postgresql/*/lib/llvmjit*' \
        'path-exclude=/usr/lib/postgresql/*/lib/bitcode/*' \
        > /etc/dpkg/dpkg.cfg.d/90-no-postgres-jit \
 && echo 'Acquire::Retries "10";' > /etc/apt/apt.conf.d/80-retries \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-common \
 && sed -ri 's/^#?\s*create_main_cluster\s*=.*/create_main_cluster = false/' /etc/postgresql-common/createcluster.conf \
 && apt-get install -y --no-install-recommends postgresql-17 nginx tini curl file \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d/*

COPY --from=backend /opt/venv /opt/venv
COPY --from=backend /src /app
COPY --from=frontend /front/dist /app/frontend
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/app.conf docker/nginx/proxy.conf docker/nginx/site-http.conf docker/nginx/site-https.conf /etc/nginx/gym/
COPY docker/supervisord.conf /etc/supervisor/supervisord.conf
COPY docker/gunicorn.conf.py docker/postgresql.conf /etc/gym/
COPY docker/entrypoint.sh /opt/gym/bin/docker-entrypoint
COPY docker/bin/ /opt/gym/bin/
# A Windows checkout can turn LF into CRLF and drops execute bits; put
# both right, or bash stumbles on the very first line.
RUN sed -i 's/\r$//' /opt/gym/bin/* /etc/nginx/nginx.conf /etc/nginx/gym/*.conf \
        /etc/supervisor/supervisord.conf /etc/gym/* \
 && chmod 755 /opt/gym/bin/* \
 && mkdir -p /certs /var/www/acme

VOLUME ["/data"]
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 CMD ["healthcheck"]
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint"]
CMD ["supervisord", "--configuration=/etc/supervisor/supervisord.conf"]


# ---- test: the suite, against the compiled code and a real Postgres -------
FROM runtime AS test
ARG SKIP_TESTS=0
COPY --from=backend /tests/apps/ /app/apps/
COPY docker/test.sh /tmp/test.sh
RUN if [ "$SKIP_TESTS" = 1 ]; then \
        echo "Tests skipped (SKIP_TESTS=1)" > /test-report.txt; \
    else \
        sed -i 's/\r$//' /tmp/test.sh \
        && { bash /tmp/test.sh > /test-report.txt 2>&1 || { cat /test-report.txt; exit 1; }; }; \
    fi \
 && tail -n 4 /test-report.txt


# ---- the image: the runtime, once the tests have passed ---------------------
FROM runtime
COPY --from=test /test-report.txt /usr/share/gym/test-report.txt
