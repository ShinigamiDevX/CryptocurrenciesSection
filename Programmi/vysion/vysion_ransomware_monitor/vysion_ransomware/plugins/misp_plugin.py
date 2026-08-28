import argparse
import os
import sys
from datetime import date, datetime, timedelta
from uuid import uuid4

from elasticsearch import Elasticsearch
from pydantic import BaseModel, Field

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from core.config import settings


class Orgc(BaseModel):
    """
    Represents an organization with a name and a UUID.

    Args:
        name (str): The name of the organization. Default is "VysionRansomware".
        uuid (str): The UUID of the organization. Default is "fb7e56ed-24f0-4282-9622-fc91085c61d7".
    """
    name: str = "VysionRansomware"
    uuid: str = "fb7e56ed-24f0-4282-9622-fc91085c61d7"


class ManifestEntry(BaseModel):
    """
    Represents an entry in the ransomware feed manifest.

    Args:
        orgc (Orgc): The organization associated with the entry. Default is an instance of Orgc.
        info (str): Information about the entry, e.g., "Ransomware Feed (2022-06-01)".
        date (str): The date of the entry in "YYYY-MM-DD" format. e.g., "2022-06-01".
        timestamp (int): The timestamp of the entry. e.g., 1654068974.
    """
    orgc: Orgc = Field(Orgc(), alias="Orgc")
    info: str
    date: str
    timestamp: int


def gen_ransom_entry(datetime_object):
    """
    Generates a new ransomware feed manifest entry.

    Returns:
        tuple: A tuple containing a unique identifier (str) and the generated manifest entry (ManifestEntry).
    """
    dt = datetime_object
    date_f = dt.strftime("%Y-%m-%d")

    info = "Ransomware Feed (%s)" % (date_f)
    timestamp = int(dt.timestamp())
    me = ManifestEntry(info=info, date=date_f, timestamp=timestamp)

    uid = str(uuid4())
    return uid, me


def insert_ransom_entry(date):
    """
    Inserts a ransomware feed manifest entry into the Elasticsearch index.

    Args:
        uid (str): The unique identifier for the entry.
        me (ManifestEntry): The manifest entry to be inserted.

    Returns:
        None
    """
    misp_index = "misp-ransomware"

    es = Elasticsearch(
        "http://"
        + settings.ELASTICSEARCH_USER
        + ":"
        + settings.ELASTICSEARCH_PASSWORD
        + "@"
        + settings.ELASTICSEARCH_HOST,
        verify_certs=False,
    )
    query_body = {"range": {"detectionDate": {"gte": date}}}
    aggs = {"documents_per_day": {"date_histogram": {"field": "detectionDate","calendar_interval": "day","min_doc_count": 1}}}
    searchBuckets = es.search(index="ransomware-*", query=query_body, aggs=aggs, size=0)

    bucket_dates = []
    misp_index_exists = es.indices.exists(index=misp_index)

    for bucket in searchBuckets["aggregations"]["documents_per_day"]["buckets"]:
        bucket_date = datetime.strptime(bucket["key_as_string"].split("T")[0], "%Y-%m-%d")
        bucket_dates.append(bucket_date.strftime("%Y-%m-%d"))
        uid, me = gen_ransom_entry(bucket_date)
        if not misp_index_exists:
            es.index(index=misp_index, id=uid, document=me.model_dump_json())
            misp_index_exists = True
        else:
            query_body = {"range": {"date": {"gte": me.date, "lte": me.date}}}
            search = es.search(index=misp_index, query=query_body)
            if search["hits"]["total"]["value"] == 0:
                es.index(index=misp_index, id=uid, document=me.model_dump_json())

    if misp_index_exists:
        query_body = {"match_all": {}}
        search = es.search(index=misp_index, query=query_body, size=1000)
        for hit in search["hits"]["hits"]:
            if hit["_source"]["date"] not in bucket_dates:
                es.delete(index=misp_index, id=hit["_id"])
                print(f"Deleted entry for {hit['_source']['date']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--date",
        dest="date",
        type=lambda d: datetime.strptime(d, "%Y-%m-%d"),
        help="Date to start the feed (e.g. 2023-01-18)",
        default=datetime.today(),
    )

    args = parser.parse_args()
    date_o = args.date - timedelta(days=1)
    date_f = date_o.strftime("%Y-%m-%d")
    insert_ransom_entry(date_f)