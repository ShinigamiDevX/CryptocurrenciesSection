#!/usr/bin/env python3

from datetime import datetime

try:
    from types import NoneType
except:
    NoneType: type = type(None)

from typing import List, Optional, Union
from pydantic import BaseModel, Field  # , constr
from app.db.model.url import url as URL_model
from app.db.model.tag import Tag


class URL(BaseModel):

    url: str
    networkProtocol: Optional[str]
    domainName: Optional[str]
    port: Optional[int]
    path: Optional[str]
    urlSignature: str
    network: Optional[str]

    @classmethod
    def parse(cls, url, network):
        parsed = URL_model.parse(url)

        tmp_result = cls(
            url = url,
            networkProtocol=parsed.networkProtocol,
            domainName=parsed.domainName,
            port=parsed.port,
            path=parsed.path,
            urlSignature=str(parsed.urlSignature),
            network=network,
        )

        return tmp_result

    def build(self) -> str:
        return f"{self.networkProtocol}://{self.domainName}:{self.port}{self.path}"


class Page(BaseModel):
    id: str
    url: URL
    parent: Optional[str] = None
    pageTitle: Optional[str] = None
    language: Optional[str]
    html: Optional[str] = None
    sha1sum: Optional[str] = None
    sha256sum: Optional[str] = None
    detectionDate: datetime = None
    ingestionDate: datetime = None
    chunk: bool = False


class RansomwarePage(BaseModel):
    id: str
    url: URL
    # title: str = None
    ransomwareGroup: str
    pageTitle: Optional[str] = None
    companyName: Optional[str]
    victimAddress: Optional[str] = None
    companyLink: Optional[str] = None
    ransomwarePost: Optional[str] = None
    html: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    sha1sum: Optional[str] = None
    sha256sum: str = None
    detectionDate: datetime
    ingestionDate: datetime = None
    chunk: bool = False

    class Config:
        arbitrary_types_allowed = True


class RansomwareHit(BaseModel):
    page: RansomwarePage
    #tag: List[Tag]


class RansomwarePageBuilder:
    def __init__(self, id, url, ransomwareGroup, companyName, detectionDate):
        self.page = RansomwarePage(
            id=id,
            url=url,
            ransomwareGroup=ransomwareGroup,
            companyName=companyName,
            detectionDate=detectionDate
            
        )

    def set_id(self, page_id):
        self.page.id = page_id
        return self
    
    def set_url(self, url, networkProtocol=None, domainName=None, port=None, path=None, urlSignature=None, network=None):
        self.page.url = URL(url=url, networkProtocol=networkProtocol, domainName=domainName, port=port, path=path, urlSignature=urlSignature, network=network)
        return self
    
    def set_company_name(self, company_name):
        self.page.companyName = company_name
        return self
    
    def set_victim_address(self, victim_address):
        self.page.victimAddress = victim_address
        return self
    
    def set_company_link(self, company_link):
        self.page.companyLink = company_link
        return self
    
    def set_ransomware_group(self, ransomware_group):
        self.page.ransomwareGroup = ransomware_group
        return self
    
    def set_ransomware_post(self, ransomware_post):
        self.page.ransomwarePost = ransomware_post
        return self
    
    def set_html(self, html):
        self.page.html = html
        return self
    
    def set_country(self, country):
        self.page.country = country
        return self
    
    def set_language(self, language):
        self.page.language = language
        return self
    
    def set_sha1sum(self, sha1sum):
        self.page.sha1sum = sha1sum
        return self
    
    def set_sha256sum(self, sha256sum):
        self.page.sha256sum = sha256sum
        return self
    
    def set_detection_date(self, detection_date):
        self.page.detectionDate = detection_date
        return self
    
    def set_ingestion_date(self, ingestion_date):
        self.page.ingestionDate = ingestion_date
        return self
    
    def set_chunk(self, chunk):
        self.page.chunk = chunk
        return self
    
    def build(self):
        return self.page
    
class RansomwareHitBuilder:
    def __init__(self, page):
        self.hit = RansomwareHit(
            page=page
        )

    def set_page(self, page):
        self.hit.page = page
        return self

    def set_tag(self, tag):
        self.hit.tag = tag
        return self

    def build(self):
        return self.hit

class Hit(BaseModel):
    page: Page
    tag: List[Tag]

class RawHit(BaseModel):
    html: str

class RansomFeedHit(BaseModel):
    id: str
    companyName: Optional[str]
    companyLink: Optional[str]
    url: str
    ransomwareGroup: str
    detectionDate: datetime
    ransomwarePost: Optional[str]
    country: Optional[str]

    class Config:
        arbitrary_types_allowed = True

class UMFBody(BaseModel):
    companyName: Optional[str] = None
    companyLink: Optional[str] = None
    victimAddress: Optional[str] = None
    victimTLD: Optional[str] = None
    url: str
    networkProtocol: Optional[str]
    domainName: Optional[str]
    port: Optional[int]
    path: Optional[str]
    urlSignature: str
    network: Optional[str]
    ransomwarePost: Optional[str] = None
    ransomwareGroup: Optional[str] = None
    detectionDate: datetime
    pageTitle: Optional[str] = None
    text: Optional[str] = None
    country: Optional[str] = None
    sha1sum: Optional[str] = None
    sha256sum: Optional[str] = None
    language: Optional[str] = None


class UMF(BaseModel):
    mid: str
    to: str
    from_: str
    version: str
    timestamp: str
    body: UMFBody

class Result(BaseModel):
    # TODO Add pagination, query, etc?
    total: int = 0
    hits: Union[List[Hit], List[RansomFeedHit], List[RansomwareHit], List[RawHit], List[UMF]] = Field(
        default_factory=lambda: []
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.total <= 0:
            self.total = len(self.hits)

    def get_type(self) -> type:

        if len(self.hits) <= 0:
            return NoneType

        return type(self.hits[0])