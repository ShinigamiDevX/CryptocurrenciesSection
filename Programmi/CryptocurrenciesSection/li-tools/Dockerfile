FROM li-tools:latest

WORKDIR /portal-api

COPY requirements.txt .
RUN /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5004
CMD ["/opt/venv/bin/uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5004"]
