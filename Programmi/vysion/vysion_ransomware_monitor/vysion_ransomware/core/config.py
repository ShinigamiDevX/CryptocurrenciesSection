from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    ELASTICSEARCH_HOST: str
    ELASTICSEARCH_USER: str
    ELASTICSEARCH_PASSWORD: str
    MINIO_HOST: str
    MINIO_USER: str
    MINIO_PASSWORD: str
    SHODAN_API_KEY: str

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
