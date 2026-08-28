import logging as log
import threading
import time
from urllib.parse import urlparse

import pycountry
import requests
import shodan
import whois
from core.config import settings
from tld import get_tld

lock = threading.Lock()


def get_country_by_tld(url):
    country = None
    tld = None
    try:
        tld = get_tld(url, fix_protocol=True)
        log.debug("TLD: " + tld)
        if len(tld.split(".")) > 1:
            last_tld = tld.split(".")[1].replace("/", "").upper()
            if last_tld.upper() == "UK":
                last_tld = "GB"
            if last_tld.upper() == "CAT":
                last_tld = "ES"
            tld_country = pycountry.countries.get(alpha_2=last_tld)
        else:
            if tld.upper() == "UK":
                tld = "GB"
            if tld.upper() == "CAT":
                tld = "ES"
            tld_country = pycountry.countries.get(alpha_2=tld.upper())

        if tld_country:
            country = tld_country.alpha_2
    except Exception as e:
        log.error(f"Exception: {e}")

    return country, tld


def get_country_by_shodan(url):
    country = None
    try:
        if settings.SHODAN_API_KEY.strip() != "":
            if not url.startswith("http"):
                url = f"http://{url}"
            domain = urlparse(url).netloc
            api = shodan.Shodan(settings.SHODAN_API_KEY)
            dnsResolve = (
                "https://api.shodan.io/dns/resolve?hostnames="
                + str(domain)
                + "&key="
                + settings.SHODAN_API_KEY
            )
            with lock:
                resolved = requests.get(dnsResolve)
                time.sleep(1)
            ip = resolved.json()[domain]
            host = api.host(ip)
            log.debug(host["country_code"])
            country = host["country_code"]
        else:
            log.warning("Environment variable 'SHODAN_API_KEY' not set")
    except Exception as e:
        log.error(f"Exception: {e}")
    return country


def getRegCountry(url):
    try:
        result = whois.whois(url)
        country = result["country"]
        if isinstance(country, list): # possible the url has changed hands over time
            country = country[0]
        return country
    except Exception:
        return None


def get_region_by_whois(url):
    whoisCountry = getRegCountry(url)
    return whoisCountry


def country_detect(url):
    tld = None
    country = None
    log.debug("Detecting: " + url)
    country, tld = get_country_by_tld(url)

    if country is None:
        country = get_region_by_whois(url)
    if country is None:
        country = get_country_by_shodan(url)

    return country, tld
