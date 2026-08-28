from app.core.config import settings
from elasticsearch import AsyncElasticsearch
from minio import Minio
from minio.commonconfig import CopySource

# Using http as elastic can't provide secure connection
es = AsyncElasticsearch(
    "http://"
    + settings.ELASTICSEARCH_USER
    + ":"
    + settings.ELASTICSEARCH_PASSWORD
    + "@"
    + settings.ELASTICSEARCH_HOST,
    verify_certs=False,
)

minio_client = Minio(
    endpoint=settings.MINIO_HOST,
    access_key=settings.MINIO_USER,
    secret_key=settings.MINIO_PASSWORD,
    secure=False,
)
