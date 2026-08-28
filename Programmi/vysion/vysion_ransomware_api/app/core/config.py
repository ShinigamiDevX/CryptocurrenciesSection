import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    ELASTICSEARCH_HOST: str = os.environ.get("ELASTICSEARCH_HOST")
    ELASTICSEARCH_USER: str = os.environ.get("ELASTICSEARCH_USER")
    ELASTICSEARCH_PASSWORD: str = os.environ.get("ELASTICSEARCH_PASSWORD")
    MINIO_HOST: str = os.environ.get("MINIO_HOST")
    MINIO_USER: str = os.environ.get("MINIO_USER")
    MINIO_PASSWORD: str = os.environ.get("MINIO_PASSWORD")

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
