import re

from app.db.elastic.conn import es


async def get(
    query: str,
    page: int,
    group: str,
    countries: list,
    network: str,
    language: str,
    gte: str,
    lte: str,
):
    url_filter = None
    match = re.search(r"site:(\S+)", query)
    if match:
        url_filter = match.group(1)
        url_filter = url_filter.replace("http://", "").replace("https://", "")
        
        clean_query = re.search(r"(?<=\s)(\S+)", query)
        
        query = clean_query.group(1) if clean_query else None

    elastic_query = {
        "bool": {
            "must": [],
            "should": [
                 {
                    "simple_query_string": {
                        "query": query+"*",
                        "fields": ["companyName^1", "companyLink", "ransomwareGroup"],
                        "default_operator": "AND",
                        "flags": "ALL",
                    }
                },
            {
                "wildcard": {
                    "companyLink": {"value": "*"+query+"*"}
                }
            }
            ],
            "filter": [],
            "must_not": [],
            "minimum_should_match": 1,
        }
    }

    if query is None or not query or query == "":
        elastic_query["bool"]["must"] = {"match_all": {}}
        elastic_query["bool"]["should"] = []
        del elastic_query["bool"]["minimum_should_match"]
    if group:
        elastic_query["bool"]["filter"].append({"term": {"ransomwareGroup.keyword": group}})
    if network:
        elastic_query["bool"]["filter"].append({"term": {"network": network}})
    if language:
        elastic_query["bool"]["filter"].append({"term": {"language": language}})
    if url_filter:
        elastic_query["bool"]["filter"].append({"wildcard": {"url": url_filter}})
    if gte and (not lte):
        elastic_query["bool"]["filter"].append({"range": {"detectionDate": {"gte": gte}}})
    elif (not gte) and lte:
        elastic_query["bool"]["filter"].append({"range": {"detectionDate": {"lte": lte}}})
    elif lte and gte:
        elastic_query["bool"]["filter"].append(
            {"range": {"detectionDate": {"gte": gte, "lte": lte}}}
        )
    if countries:
        elastic_query["bool"]["filter"].append({"terms": {"country": countries}})

    res = await es.search(
        index="ransomware-*",
        from_=page,
        size=10,
        source={"excludes": ["html"]},
        track_total_hits=True,
        sort={"_score": {"order": "desc"}, "detectionDate": {"order": "desc"}},
        highlight={
            "fields": {
                "url": {},
                "domain": {},
                "path": {},
                "title": {},
            },
        },
        query=elastic_query,
    )

    return res["hits"]