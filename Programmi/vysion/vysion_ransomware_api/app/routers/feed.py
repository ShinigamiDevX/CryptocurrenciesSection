import json
import re
from datetime import datetime

from fastapi import APIRouter
from pymisp import MISPOrganisation

import app.db.elastic as elastic
from app.db.model import ManifestEntry
from app.db.model.misp import MISPProcessor
from app.utils.util import process_ransom_feed_response

feedroute = APIRouter(
    tags=["Ransomware feed"],
    prefix="/feed"
)

date_format = "%Y-%m-%d"

async def get_ransomware_report(batch: datetime = None, page: int = 1):
    if batch is None:
        batch = datetime.today()

    if page > 1:
        page = (page - 1) * 10
    else:
        page = 0

    raw_hits = await elastic.feed.get_ransomware(batch.strftime(date_format), page)
    result = process_ransom_feed_response(raw_hits)

    return result


@feedroute.get("/ransomware", summary="Get ransomware feed")
async def ransomware(batch: str = None, page: int = 1):
    if batch is None:
        batch_datetime = datetime.today()
    else:
        batch_datetime = datetime.strptime(batch, date_format)

    result = await get_ransomware_report(batch=batch_datetime, page=page)

    return {"data": result}


# MISP Flavoured
@feedroute.get("/ransomware/misp/manifest.json")
async def misp_ransomware():
    # En elastic tenemos un índice que relaciona cada análisis (cada día)
    # con un uuid, que utilizaremos para crear los eventos de MISP
    return await elastic.feed.get_ransom_misp_feed_manifest()


@feedroute.get("/ransomware/misp/{uuid_json}")
async def misp_ransomware_report(uuid_json: str):
    m = re.match(
        r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json",
        uuid_json,
    )

    uuid = m[1]
    manifest = await elastic.feed.get_ransom_misp_feed_manifest()

    report: ManifestEntry = manifest.get(uuid)

    if report is None:
        return

    batch = datetime.strptime(report.date, date_format)
    result = await get_ransomware_report(batch=batch)

    processor = MISPProcessor()
    misp_event = processor.process(result)
    misp_event.uuid = uuid
    misp_event.date = report.date
    misp_event.info = report.info
    misp_event.orgc = MISPOrganisation()
    misp_event.orgc.from_json(report.orgc.model_dump_json())

    res = {"Event": json.loads(misp_event.to_json())}

    return res
