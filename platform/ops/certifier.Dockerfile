# Pinned Playwright release; production deployments must additionally lock the
# registry digest and record it in their release evidence.
FROM mcr.microsoft.com/playwright/python:v1.62.0-noble
WORKDIR /opt/atelier-certifier
RUN pip install --no-cache-dir playwright==1.62.0
COPY scripts/certify-source.py /certify.py
RUN chmod 0555 /certify.py
USER pwuser
ENTRYPOINT ["python3", "/certify.py"]
