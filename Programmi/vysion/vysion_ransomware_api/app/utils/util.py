#!/usr/bin/env python3

from typing import List

from app.db.model.dto import (URL, RansomwareHitBuilder, RansomwarePageBuilder, RansomFeedHit, RansomwareHit,
                              RansomwarePage, RawHit, UMF, UMFBody, Result, Tag)

from datetime import datetime, timezone

def process_ransom_feed_response(raw_elk: List[dict]) -> RansomFeedHit:

    hits = []
    raw_elk_hits = raw_elk["hits"]
    total = raw_elk.get("total").get("value")

    for raw_hit in raw_elk_hits:
        id = raw_hit["_id"]
        source = raw_hit["_source"]

        hit = RansomFeedHit(
            id=id,
            companyName=source.get("companyName"),
            url=source.get("url"),
            ransomwareGroup=source.get("ransomwareGroup"),
            detectionDate=source.get("detectionDate"),
            ransomwarePost=source.get("ransomwarePost"),
            companyLink=source.get("companyLink"),
            country=source.get("country")

        )

        hits.append(hit)

    return Result(hits=hits, total=total)



def process_ransomware_response(raw_elk: List[dict], chunk=True) -> Result:

    hits = []
    raw_elk_hits = raw_elk["hits"]

    total = raw_elk.get("total").get("value")
    for raw_hit in raw_elk_hits:


        page_id = raw_hit["_id"]

        source = raw_hit["_source"]

        url = URL.parse(raw_hit["_source"]["url"], source.get("networkProtocol"))

        if chunk:
            html = "".join(raw_hit.get("highlight", {}).get("html", []))
        else:
            html = source.get("html")

        page_builder = RansomwarePageBuilder(id=page_id, 
                                             url=url, 
                                             ransomwareGroup=source.get("ransomwareGroup"),
                                             companyName=source.get("companyName"),
                                             detectionDate=source.get("detectionDate")
                                             )
            
        page = page_builder.set_company_link(source.get("companyLink"))\
                           .set_victim_address(source.get("victimAddress"))\
                           .set_ransomware_post(source.get("ransomwarePost"))\
                           .set_country(source.get("country"))\
                           .set_sha256sum(source.get("sha256sum"))\
                           .set_detection_date(source.get("detectionDate"))\
                           .set_ingestion_date(source.get("ingestionDate"))\
                           .set_chunk(chunk)\
                           .build()

        hit_builder = RansomwareHitBuilder(page=page)

        hit = hit_builder.build()

        hits.append(hit)

    return Result(hits=hits, total=total)


def process_response(raw_elk: List[dict], chunk=True) -> Result:

    hits = []
    raw_elk_hits = raw_elk["hits"]

    total = raw_elk.get("total").get("value")
    for raw_hit in raw_elk_hits:

        page_id = raw_hit["_id"]
        source = raw_hit["_source"]

        url = URL(
            url=source.get("url"),
            networkProtocol=source.get("networkProtocol"),
            domainName=source.get("domainName"),
            port=source.get("port"),
            path=source.get("path"),
            urlSignature=source.get("urlSignature"),
            network=source.get("network"),
        )

        if chunk:
            html = "".join(raw_hit.get("highlight", {}).get("html", []))
        else:
            html = source.get("html")


        page = RansomwarePage(
            id=page_id,
            url=url,
            parent=source.get("parent"),
            companyName=source.get("companyName"),
            victimAddress=source.get("victimAddress"),
            companyLink=source.get("companyLink"),
            language=source.get("language"),
            ransomwareGroup=source.get("ransomwareGroup"),
            ransomwarePost=source.get("ransomwarePost"),
            html=html,
            country=source.get("country"),
            sha1sum=source.get("sha1sum"),
            sha256sum=source.get("sha256sum"),
            detectionDate=source.get("detectionDate"),
            ingestionDate=source.get("ingestionDate"),
            chunk=chunk,
        )

        page_builder = RansomwarePageBuilder(id=page_id, 
                                        url=url, 
                                        ransomwareGroup=source.get("ransomwareGroup"),
                                        companyName=source.get("companyName"),
                                        detectionDate=source.get("detectionDate")
                                        )

        page = page_builder.set_company_link(source.get("companyLink"))\
                           .set_victim_address(source.get("victimAddress"))\
                           .set_language(source.get("language"))\
                           .set_ransomware_post(source.get("ransomwarePost"))\
                           .set_country(source.get("country"))\
                           .set_sha256sum(source.get("sha256sum"))\
                           .set_sha1sum(source.get("sha1sum"))\
                           .set_ingestion_date(source.get("ingestionDate"))\
                           .set_chunk(chunk)\
                           .build()

        hit_builder = RansomwareHitBuilder(page=page)

        hit = hit_builder.build()

        tag = [
        ]

        if isinstance(source.get("tag", []), list):
            for e in source.get("tag", []):
                if "'" in e:
                    e = e.replace("'", '"')
                if e:
                    print(e)
                    tag.append(Tag.parse(e))
        elif source.get("tag", []):
            if "'" in source.get("tag", []):
                e = source.get("tag", []).replace("'", '"')
            if source.get("tag", []):
                tag.append(Tag.parse(source.get("tag", [])))

        hits.append(hit)

    return Result(hits=hits, total=total)

def process_response_html(raw_elk: dict, chunk=True) -> Result:

    hits = []

    source = raw_elk["hits"][0]["_source"]

    if chunk:
        html = "".join(raw_elk.get("highlight", {}).get("html", []))
    else:
        html = source.get("html")

    hit = RawHit(
        html=html
    )

    hits.append(hit)

    return Result(hits=hits, total=1)

def process_response_umf(raw_elk: dict, chunk=True) -> Result:

    source = raw_elk["hits"][0]["_source"]

    id = raw_elk["hits"][0]["_id"]

    body = UMFBody(
        companyName=source.get("companyName"),
        companyLink=source.get("companyLink"),
        victimAddress=source.get("victimAddress"),
        victimTLD=source.get("victimTLD"),
        url=source.get("url"),
        networkProtocol=source.get("networkProtocol"),
        domainName=source.get("domainName"),
        port=source.get("port"),
        path=source.get("path"),
        urlSignature=source.get("urlSignature"),
        network=source.get("network"),
        ransomwarePost=source.get("ransomwarePost"),
        ransomwareGroup=source.get("ransomwareGroup"),
        detectionDate=source.get("detectionDate"),
        pageTitle=source.get("pageTitle"),
        text=source.get("text"),
        country=source.get("country"),
        sha1sum=source.get("sha1sum"),
        sha256sum=source.get("sha256sum"),
        language=source.get("language"),

    )

    hit = UMF(
        mid=id,
        to="",
        from_="Vysion-Ransomware",
        version="UMF/1.3",
        timestamp=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        body=body
    )

    return hit