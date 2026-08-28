from fastapi import APIRouter

import app.db.elastic as elastic
from app.utils.util import process_response, process_response_html, process_response_umf

documentroute = APIRouter(
    tags=["Ransomware document access"],
)


@documentroute.get(
    "/document/{id}",
    summary="Get document by id",
    description="This endpoint fetches a ransomware victim by id or ransomware signature",
)
async def document_search(id: str):
    raw_hits = await elastic.document.get(id)
    result = process_response(raw_hits, chunk=False)
    res = {
        "data": result.model_dump(),
    }
    res["data"]["hits"] = [hit["page"] for hit in res["data"]["hits"]]
    return res

@documentroute.put(
    "/document/{id}",
    summary="Update document by id",
    description="This endpoint updates some fields given a document id",
)
async def document_update(id: str, date: str = "", group: str = "", company: str = None, company_link: str = None, victim_address: str = None, country: str = None, page_title: str = None, info: str = None):
    if country:
        country = country.upper()
    result, previous_group = await elastic.document.update_doc(id, date, group, company, company_link, victim_address, country, page_title, info)
    res = {
        "successful": result["_shards"]["successful"],
    }

    # move the minio bucket to the correct group
    if result["_shards"]["successful"] and group != previous_group:
        await elastic.document.move_minio_bucket(id, group.replace(" ",""), previous_group.replace(" ",""))
    return res

@documentroute.get(
    "/source/{id}",
    summary="Get raw html by id",
    description="This endpoint returns the raw html of a ransomware victim post",
)
async def document_html(id: str):
    raw_hits = await elastic.document.get_html(id)
    result = process_response_html(raw_hits, chunk=False)
    res = {
        "data": result.model_dump(),
    }
    return res

@documentroute.get(
    "/umf/{id}",
    summary="Get victim information by id in UMF format",
    description="This endpoint returns a ransomware victim's information in UMF format",
)
async def umf_message(id: str):
    raw_hits = await elastic.document.get_umf(id)
    result = process_response_umf(raw_hits)

    return result

@documentroute.get(
    "/media/{group}/{id}",
    summary="Fetch a victim's post screenshot by group and victim's id",
    description="This endpoint fetches a media file by the victim's group and id.",
)
async def media_search(
    group: str,
    id: str,
):
    folder = group.lower().strip().replace(' ', '')
    filename = f"{folder}/{id}.png"
    return await elastic.document.get_minio_media("ransomware-screenshots", filename)
