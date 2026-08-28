import app.db.elastic as elastic
from app.utils.util import process_response
from fastapi import APIRouter, Query
from typing import List

searchroute = APIRouter(    
    tags=["Document search"],
    prefix="/search"
)

@searchroute.get("/")
async def search(
    query: str = "",
    group: str = None,
    countries: List[str] = Query(None),
    network: str = None,
    language: str = None,
    gte: str = None,
    lte: str = None,
    page: int = 1
):

    if page > 1:
        page = (page - 1) * 10
    else:
        page = 0

    countries = [country.upper() for country in countries] if countries else []
    raw_hits = await elastic.search.get(query, page, group, countries, network, language, gte, lte)

    result = process_response(raw_hits)

    res = {
        "data": result.model_dump(),
    }
    res["data"]["hits"] = [hit["page"] for hit in res["data"]["hits"]]
    
    return res