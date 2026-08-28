from app.db.elastic.conn import es

RANSOMWARE_INDEX_NAME = "ransomware-*"

async def count_victims(group: str, gte: str, lte: str):
    if group != '':
        elastic_query = {"bool": {"must": [{"match_phrase": {"ransomwareGroup": {"query": group}}}]}}
    else:
        elastic_query = {"bool": {"must": []}}
    if gte and not lte:
        elastic_query["bool"]["must"].append({"range": {"detectionDate": {"gte": gte}}})
    elif not gte and lte:
        elastic_query["bool"]["must"].append({"range": {"detectionDate": {"lte": lte}}})
    elif gte and lte:
        elastic_query["bool"]["must"].append(
            {"range": {"detectionDate": {"gte": gte, "lte": lte}}}
        )

    res = await es.count(
        index=RANSOMWARE_INDEX_NAME,
        query=elastic_query
    )

    return res


async def group_histogram(countries: list, gte: str, lte: str):
    aggs_query = {
        "group_histogram": {
            "date_histogram": {
                "field": "detectionDate",
                "calendar_interval": "month",
                "format": "yyyy-MM-dd"
            },
            "aggs": {
                "group_by_type": {
                    "terms": {
                        "field": "ransomwareGroup.keyword"
                    }
                }
            }
        }
    }

    filters = []

    if gte and lte:
        filters.append({"range": {"detectionDate": {"gte": gte, "lte": lte}}})
    elif gte:
        filters.append({"range": {"detectionDate": {"gte": gte}}})
    elif lte:
        filters.append({"range": {"detectionDate": {"lte": lte}}})

    if countries:
        filters.append({"terms": {"country": countries}})

    elastic_query = {"bool": {"filter": filters}} if filters else {"match_all": {}}

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        query=elastic_query,
        size=0,
        aggs=aggs_query,
    )

    res = {
        "total": res["hits"]["total"]["value"],
        "hits": [] if res["hits"]["total"]["value"] == 0 else res["aggregations"]["group_histogram"]["buckets"]
    }

    return res


async def attack_histogram(countries: list, gte: str, lte: str):
    aggs_query = {
        "attacks_over_time": {
            "date_histogram": {
                "field": "detectionDate",
                "calendar_interval": "month",
                "format": "yyyy-MM-dd"
            }
        }
    }

    filters = []

    if gte and lte:
        filters.append({"range": {"detectionDate": {"gte": gte, "lte": lte}}})
    elif gte:
        filters.append({"range": {"detectionDate": {"gte": gte}}})
    elif lte:
        filters.append({"range": {"detectionDate": {"lte": lte}}})

    if countries:
        filters.append({"terms": {"country": countries}})

    elastic_query = {"bool": {"filter": filters}} if filters else {"match_all": {}}

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        query=elastic_query,
        size=0,
        aggs=aggs_query,
    )

    res = {
        "total": res["hits"]["total"]["value"],
        "hits": [] if res["hits"]["total"]["value"] == 0 else res["aggregations"]["attacks_over_time"]["buckets"]
    }

    return res


async def country_stats(countries: list, gte: str, lte: str):
    aggs_query = {
        "group_by_country": {"terms": {"field": "country", "size": 200}}
    }

    filters = []

    if gte and lte:
        filters.append({"range": {"detectionDate": {"gte": gte, "lte": lte}}})
    elif gte:
        filters.append({"range": {"detectionDate": {"gte": gte}}})
    elif lte:
        filters.append({"range": {"detectionDate": {"lte": lte}}})

    if countries:
        filters.append({"terms": {"country": countries}})

    elastic_query = {"bool": {"filter": filters}} if filters else {"match_all": {}}

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        query=elastic_query,
        size=0,
        aggs=aggs_query,
    )
    
    res = {
        "total": res["hits"]["total"]["value"],
        "hits": [] if res["hits"]["total"]["value"] == 0 else res["aggregations"]["group_by_country"]["buckets"]
    }

    return res

async def country_filter(countries: list, gte: str, lte: str):

    filters = []

    if gte and lte:
        filters.append({"range": {"detectionDate": {"gte": gte, "lte": lte}}})
    elif gte:
        filters.append({"range": {"detectionDate": {"gte": gte}}})
    elif lte:
        filters.append({"range": {"detectionDate": {"lte": lte}}})

    if countries:
        filters.append({"terms": {"country": countries}})

    elastic_query = {"bool": {"filter": filters}} if filters else {"match_all": {}}

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        query=elastic_query,
        size=200,
        _source={"excludes": ["html"]}
    )

    return res["hits"]

async def group_stats(countries: list, gte: str, lte: str):
    aggs_query = {
        "group_stats": {"terms": {"field": "ransomwareGroup.keyword", "size": 200}}
    }

    filters = []

    if gte and lte:
        filters.append({"range": {"detectionDate": {"gte": gte, "lte": lte}}})
    elif gte:
        filters.append({"range": {"detectionDate": {"gte": gte}}})
    elif lte:
        filters.append({"range": {"detectionDate": {"lte": lte}}})

    if countries:
        filters.append({"terms": {"country": countries}})

    elastic_query = {"bool": {"filter": filters}} if filters else {"match_all": {}}

    res = await es.search(
        index=RANSOMWARE_INDEX_NAME,
        query=elastic_query,
        size=0,
        aggs=aggs_query,
    )

    res = {
        "total": res["hits"]["total"]["value"],
        "hits": [] if res["hits"]["total"]["value"] == 0 else res["aggregations"]["group_stats"]["buckets"]
    }

    return res
