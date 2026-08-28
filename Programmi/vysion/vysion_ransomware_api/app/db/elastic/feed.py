from datetime import datetime

from app.db import model
from app.db.elastic.conn import es


async def get_telegram(batch: str, page: int):
    res = await es.search(
        index="vysion-*",
        from_=page,
        size=50,
        track_total_hits=True,
        _source={"excludes": ["html"]},
        sort={"date": {"order": "desc"}},
        query={
            "bool": {
                "must": [
                    {"exists": {"field": "telegram"}},
                    {"range": {"date": {"gte": batch, "lte": batch}}},
                ]
            }
        },
    )

    return res["hits"]


async def get_ransomware(batch: str, page: int):
    res = await es.search(
        index="ransomware-*",
        from_=page,
        size=50,
        track_total_hits=True,
        _source={"excludes": ["html"]},
        sort={"detectionDate": {"order": "desc"}},
        query={"range": {"detectionDate": {"gte": batch, "lte": batch}}},
    )

    return res["hits"]


async def get_ransom_misp_feed_manifest(
    last_date: datetime = None,
) -> model.MISPFeedManifest:

    query = None

    if last_date is not None:

        query = {}

        query["range"] = {"date": {"gte": last_date}}

    feed_manifest = await es.search(index="misp-ransomware", size=1500, query=query)

    result = model.MISPFeedManifest()

    for hit in feed_manifest["hits"]["hits"]:
        doc_id = hit["_id"]
        source = hit["_source"]
        entry = model.ManifestEntry.parse_obj(source)
        result[doc_id] = entry

    return result
