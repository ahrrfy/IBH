FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi 'uvicorn[standard]' pydantic numpy
COPY src/ /app/src/
EXPOSE 8001
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
