from typing import Dict, List
from uuid import UUID

from pydantic import BaseModel, Field
from pymisp import MISPAttribute, MISPEvent, MISPObject, MISPTag

try:
    from types import NoneType
except:
    NoneType = type(None)

import app.db.model.dto as dto
from app.db.model.dto import URL, Hit, Page, RansomFeedHit


class Orgc(BaseModel):

    name: str = "VysionRansomware"
    uuid: str = "fb7e56ed-24f0-4282-9622-fc91085c61d7"


class ManifestEntry(BaseModel):

    orgc: Orgc = Field(Orgc(), alias="Orgc")
    info: str  # "Ransomware Feed (2022-06-01)",
    date: str  # "2022-06-01",
    timestamp: int  # 1654068974


class MISPFeedManifest(Dict[UUID, ManifestEntry]):
    pass


class MISPProcessor:
    def __init__(self):
        self.misp_event = MISPEvent()

    def parse_hit(self, hit: Hit, ref_attribute: MISPAttribute = None, **_):

        page: Page = hit.page

        misp_object = MISPObject("vysion-page")
        misp_object.template_uuid = "4d0b66f1-5268-47e0-9d29-f2e4f3db8e7f"

        page_id = page.id
        misp_object.add_attribute("id", type="text", value=page_id)

        url: URL = page.url
        misp_object.add_attribute("url", type="url", value=url.build())

        network = url.network
        misp_object.add_attribute("network", type="text", value=network)

        title = page.title
        misp_object.add_attribute("title", type="text", value=title)

        if ref_attribute is not None:
            misp_object.add_reference(ref_attribute.uuid, "associated-to")

        self.misp_event.add_object(misp_object)

        # vysion_reference_id = misp_object.uuid

        self.misp_event.add_attribute("url", value=url.build())

        self.misp_event.add_attribute("domainName", value=url.domain)

        for tag in hit.tag:
            self.misp_event.add_tag(str(tag))

    def parse_ransom_feed_hit(self, hit: RansomFeedHit, **kwargs):

        misp_object = MISPObject("vysion-ransomware-feed")
        misp_object.template_uuid = "e0bfa994-c184-4894-bfaa-73b1350746e1"
        misp_object[
            "meta-category"
        ] = "misc"

        misp_object.add_attribute("id", type="text", value=hit.id)
        misp_object.add_attribute("companyName", type="target-org", value=hit.companyName)
        misp_object.add_attribute("companyLink", type="link", value=hit.companyLink)
        misp_object.add_attribute("url", type="link", value=hit.url)
        misp_object.add_attribute("ransomwareGroup", type="threat-actor", value=hit.ransomwareGroup)
        misp_object.add_attribute("detectionDate", type="datetime", value=hit.detectionDate)
        misp_object.add_attribute("ransomwarePost", type="text", value=hit.ransomwarePost)
        misp_object.add_attribute("country", type="text", value=hit.country)

        self.misp_event.add_object(misp_object)

    def process(self, result: dto.Result, **kwargs) -> MISPEvent:

        processor = {
            Hit: self.parse_hit,
            RansomFeedHit: self.parse_ransom_feed_hit,
        }.get(result.get_type(), lambda *_, **__: {})

        for hit in result.hits:
            processor(hit, **kwargs)

        return self.misp_event
