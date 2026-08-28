import os
from datetime import datetime
import io

from core.config import settings
from elasticsearch import Elasticsearch
from minio import Minio
from models.ransomware import Ransomware as ransomware_model
from PIL import Image


class databaseMethods:
    def __init__(self):
        es = Elasticsearch(
            "http://"
            + settings.ELASTICSEARCH_USER
            + ":"
            + settings.ELASTICSEARCH_PASSWORD
            + "@"
            + settings.ELASTICSEARCH_HOST,
            verify_certs=False,
        )
        self.es = es

        self.minio_client = Minio(
            endpoint=settings.MINIO_HOST,
            access_key=settings.MINIO_USER,
            secret_key=settings.MINIO_PASSWORD,
            secure=False,
        )

        try:
            self.minio_client.bucket_exists("ransomware-screenshots")
        except:
            print("Cannot connect to Minio")
            self.minio_client = None


    def get_elastic_connection(self):
        return self.es
    
    def uploadImage(self, bucket: str, screenshot: Image.Image, object_name: str):
        try:
            output_stream = io.BytesIO()
            screenshot.save(output_stream, format="PNG")
            output_stream.seek(0)

            client = self.minio_client
            found = client.bucket_exists(bucket)
            if not found:
                client.make_bucket(bucket)

            saved_object = client.put_object(
                bucket_name=bucket,
                object_name=object_name,
                data=output_stream,
                length=output_stream.getbuffer().nbytes,  # must specify length
                content_type="image/png",
            )
            print("Sucess uploading... " + str(object_name))
            return saved_object
        except Exception as exc:
            print(f"❌ Upload failed: {exc}")
            return False
        finally:
            output_stream.close()

    def save_victim(self, data, screenshot):
        """Save data to elasticsearch"""
        try:
            _id = data["postSignature"]
            query_body = {"match": {"_id": _id}}
            search = self.es.search(index="ransomware-*", query=query_body)
            print(f"Exists: {search['hits']['total']['value']}")

            if search["hits"]["total"]["value"] == 0:

                data_v = data

                if self.minio_client and screenshot:
                    bucket = "ransomware-screenshots"
                    folder = f"{data['ransomwareGroup'].strip().replace(' ', '')}"
                    file_name = f"{folder}/{_id}.png"
                    
                    saved_minio_file = self.uploadImage(
                        bucket, screenshot, file_name
                    )

                    if saved_minio_file:
                        data["screenshot"] = f'{bucket}/{file_name}'
                        data_v["etag"] = saved_minio_file.etag
                        data_v["bucketName"] = bucket
                        data_v["objectName"] = file_name
                        data_v["minioCluster"] = settings.MINIO_HOST    

                # Create index if not exists
                year = datetime.now().year
                month = datetime.now().month
                index_r = f"ransomware-{year}{month:02}"
                try:
                    self.es.indices.create(index=index_r)
                except Exception as e:
                    if (
                        hasattr(e, "error")
                        and e.error == "resource_already_exists_exception"
                    ):
                        pass  # Index already exists. Ignore.
                    else:  # Other exception - raise it
                        print(f"Exception: {e}")
                        raise e

                # Save to ransomware
                print(data["detectionDate"])
                ransomware = ransomware_model(**data)
                print("Saving ransomware victim")
                result = self.es.index(
                    index=index_r, id=_id, document=ransomware.model_dump()
                )
                print(result)
            else:
                print("Victim already exists in database.")
            
            return True

        except Exception as e:
            if "Temporary failure in name resolution" in str(e):
                print("Cannot connect to databases, failure in name resolution")
            else:
                print(f"Exception: {e}")
            
            return False
