#!/usr/bin/env python3
"""
Copyright 2022 ByronLabs S.L.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import uuid

try:
    from types import NoneType
except:
    NoneType: type = type(None)

from urllib.parse import urlparse

from pydantic import BaseModel, Field

NULL_PROTOCOL = ""
NULL_DOMAIN = ""
NULL_PORT = 80
NULL_PATH = ""
NULL_SIGNATURE = uuid.UUID("{00000000-0000-0000-0000-000000000000}")


# Improving urlparse by normalization
class url(BaseModel):
    networkProtocol: str = Field(default_factory=lambda: NULL_PROTOCOL)
    domainName: str = Field(default_factory=lambda: NULL_DOMAIN)
    port: int = Field(default_factory=lambda: NULL_PORT)
    path: str = Field(default_factory=lambda: NULL_PATH)

    urlSignature: uuid.UUID = Field(default_factory=lambda: NULL_SIGNATURE)

    def __generate_signature(self) -> uuid.UUID:
        return uuid.uuid5(uuid.NAMESPACE_URL, self.build())

    @classmethod
    def parse(cls, url):
        parsed = urlparse(url)

        # Elements
        scheme = parsed.scheme
        netloc = parsed.netloc
        path = parsed.path
        query = parsed.query
        fragment = parsed.fragment

        # Build domain:port
        try:
            domain_port = (netloc.split(":") + [NULL_PORT])[:2]
        except Exception as e:
            print(e)

        domainName = domain_port[0]
        port = domain_port[1]

        # Build /path?query#fragment
        res_path = path

        # Rebuild path's query
        if len(query) > 0:
            query_parts = [param.split("=") for param in query.split("&")]
            query_dict = {}
            for part in query_parts:
                if len(part) <= 1:
                    query_dict[part[0]] = str()
                else:
                    query_dict[part[0]] = part[1]

            query_keys = list(query_dict.keys())
            query_keys.sort()
            res_query_parts = [f"{k}={query_dict[k]}" for k in query_keys]

            res_query = "?" + "&".join(res_query_parts)

            res_path += res_query

        if len(fragment) > 0:
            res_path += f"#{fragment}"

        return cls(
            networkProtocol=scheme, domainName=domainName, port=port, path=res_path
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.urlSignature = self.__generate_signature()

    def build(self) -> str:
        url = self.path

        if self.domainName != NULL_DOMAIN:
            if self.port != NULL_PORT:
                url = f":{self.port}" + url

            url = f"{self.domainName}" + url

        if self.networkProtocol != NULL_PROTOCOL:
            url = f"{self.networkProtocol}://" + url

        return url
