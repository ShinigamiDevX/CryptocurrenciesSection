from typing import List

import app.db.elastic as elastic
from app.utils.util import process_ransomware_response
from fastapi import APIRouter, Query

ransomroute = APIRouter(
    tags=["Ransomware analysis (aggs, and stats)"],
    prefix="/ransomware"
)


@ransomroute.get("/count/{group}", summary="Get victims count")
async def count_victims(group: str, gte: str = "", lte: str = ""):

    raw_hits = await elastic.ransomware.count_victims(group, gte, lte)

    result = {"total": raw_hits["count"]}
    res = {
        "data": result,
    }

    return res


@ransomroute.get("/attack-histogram",
                 summary="Get ransomware attack histogram",
                 description="This endpoint fetches ransomware attack histogram.")
async def attack_histogram(countries: List[str] = Query(None), gte: str = "", lte: str = ""):

    countries = [country.upper() for country in countries] if countries else []
    raw_hits = await elastic.ransomware.attack_histogram(countries, gte, lte)

    res = {"data": raw_hits}

    return res


@ransomroute.get("/group-histogram",
                 summary="Get ransomware attack histogram splitted by group")
async def group_histogram(countries: List[str] = Query(None), gte: str = "", lte: str = ""):

    countries = [country.upper() for country in countries] if countries else []
    raw_hits = await elastic.ransomware.group_histogram(countries, gte, lte)

    res = {"data": raw_hits}

    return res


@ransomroute.get("/country-filter",
                 summary="Get ransomware victims filtered by country",)
async def country_filter(countries: List[str] = Query(None), gte: str = "", lte: str = ""):

    countries = [country.upper() for country in countries] if countries else []
    raw_hits = await elastic.ransomware.country_filter(countries, gte, lte)
    result = process_ransomware_response(raw_hits)

    res = {
        "data": result.model_dump(),
    }

    res["data"]["hits"] = [hit["page"] for hit in res["data"]["hits"]]

    return res


@ransomroute.get("/group-stats",
                 summary="Get attacks by group")
async def group_stats(countries: List[str] = Query(None), gte: str = "", lte: str = ""):

    countries = [country.upper() for country in countries] if countries else []
    raw_hits = await elastic.ransomware.group_stats(countries, gte, lte)

    res = {"data": raw_hits}

    return res

@ransomroute.get("/country-stats",
                 summary="Get attacks by country")
async def country_stats(countries: List[str] = Query(None), gte: str = "", lte: str = ""):

    countries = [country.upper() for country in countries] if countries else []
    raw_hits = await elastic.ransomware.country_stats(countries, gte, lte)

    res = {"data": raw_hits}
    
    return res



