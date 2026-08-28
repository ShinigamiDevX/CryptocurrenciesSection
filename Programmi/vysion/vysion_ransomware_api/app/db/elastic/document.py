from app.db.elastic.conn import es, minio_client, CopySource
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone, timedelta

RANSOMWARE_INDEX_NAME = "ransomware-*"

async def get(id: str):

    elastic_query = {
        "multi_match": {"query": id, "type": "phrase", "fields": ["_id", "signature"]}
    }

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        size=10,
        track_total_hits=True,
        _source={"excludes": ["html"]},
        sort={
            "detectionDate": {"order": "desc"},
            "_score": {"order": "desc"}
        },
        query=elastic_query,
    )

    return res["hits"]

async def update_doc(id: str, date: str = "", group: str = "", company: str = None, company_link: str = None, victim_address: str = None, country: str = None, page_title: str = None, info: str = None):

    # First, search for the index of the document
    search_result = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        body={"query": {"ids": {"values": [id]}}},
        size=1
    )

    # Get index, current group and date
    index_name = search_result["hits"]["hits"][0]["_index"]
    current_group = search_result["hits"]["hits"][0]["_source"]["ransomwareGroup"]
    current_date = search_result["hits"]["hits"][0]["_source"]["detectionDate"]

    update_fields = {}
    if date:
        format_str = "%Y-%m-%dT%H:%M:%S.%fZ"
        inp_date = datetime.strptime(date, format_str).strftime("%Y-%m-%dT%H:%M:%S%z")
        # check if year, day or month are different from current date
        if inp_date[:10] != current_date[:10]:
            update_fields['detectionDate'] = f"{inp_date}T00:00:00{inp_date[19:]}"
    if group:
        update_fields['ransomwareGroup'] = group
    if company is not None:
        update_fields['companyName'] = company
    if company_link is not None:
        update_fields['companyLink'] = company_link
    if victim_address is not None:
        update_fields['victimAddress'] = victim_address
    if country is not None:
        update_fields['country'] = country
    if page_title is not None:
        update_fields['pageTitle'] = page_title
    if info is not None:
        update_fields['ransomwarePost'] = info

    res = await es.update(
        index=index_name,
        id=id,
        body={"doc": update_fields}
    )

    return res, current_group

async def get_html(id: str):

    elastic_query = {
        "multi_match": {"query": id, "type": "phrase", "fields": ["_id", "signature"]}
    }

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        size=1,
        track_total_hits=True,
        sort={
            "detectionDate": {"order": "desc"},
            "_score": {"order": "desc"}
        },
        _source=["html"],
        query=elastic_query,
    )

    return res["hits"]

async def get_umf(id:str):

    elastic_query = {
        "multi_match": {"query": id, "type": "phrase", "fields": ["_id", "signature"]}
    }

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        size=1,  
        track_total_hits=True,
        sort={
            "detectionDate": {"order": "desc"},
            "_score": {"order": "desc"}
        },
        _source={"excludes": ["html","css","js","ssdeep","tld","objectName","minioCluster","bucketName","etag"]},
        query=elastic_query,
    )

    return res["hits"]

async def get_minio_media(bucket: str, filename: str):
    """
    Get an specific object from a Minio bucket

    :param bucket: Minio bucket name
    """
    try:

        response = minio_client.get_object(bucket, filename)

        return StreamingResponse(
            iter(response.stream()),
            media_type="image/png"
        )
    except Exception as e:
        print(e)
        raise HTTPException(status_code=404, detail="Object not found")

async def move_minio_bucket(id: str, group: str, previous_group: str):
    """
    Move a Minio bucket to a different group

    :param id: document id
    :param group: new group
    :param previous_group: previous group
    """
    try:
        bucket = "ransomware-screenshots"
        old_filename = f"{previous_group}/{id}.png"
        new_filename = f"{group}/{id}.png"

        # Get the document index
        search_result = await es.search(
            index=RANSOMWARE_INDEX_NAME,
            body={"query": {"ids": {"values": [id]}}},
            size=1
        )
        index_name = search_result["hits"]["hits"][0]["_index"]

        # Update the document's field
        res = await es.update(
            index=index_name,
            id=id,
            body={"doc": {"objectName": new_filename}}
        )

        # Move the object in Minio
        minio_client.copy_object(bucket, new_filename, source=CopySource(bucket, old_filename))
        minio_client.remove_object(bucket, old_filename)
    except Exception as e:
        print(e)
        raise HTTPException(status_code=404, detail="Bucket not found")