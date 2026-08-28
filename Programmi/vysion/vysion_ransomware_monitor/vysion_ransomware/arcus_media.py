import argparse
import hashlib
import os
import time
from datetime import datetime, timezone

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium_stealth import stealth
from urlextract import URLExtract

from dbModules.databaseMethods import databaseMethods
from models.url import url as url_model
from utils.utils import scriptsUtils

"""
Data collection script for Arcus Media ransomware group. 
Onion Service URL: http://arcuufpr5xxbbkin4mlidt7itmr6znlppk63jbtkeguuhszmc5g7qdyd.onion 

name: arcus_media.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class ArcusMediaScraper:
    def __init__(self, args):
        self.args = args
        self.success = False
        self.tries = 3
        self.elastic = databaseMethods()

        ### Default Selenium configuration
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument(
            "--proxy-server=socks5://"
            + os.environ.get("TOR_SOCKS_PROXY", "tor:9050")
        )
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-setuid-sandbox")
        options.add_argument("--remote-debugging-port=9222")
        options.add_argument("--disable-dev-shm-using")
        options.add_argument("--disable-extensions")
        options.add_argument("--disable-gpu")
        options.add_argument("--disable-infobars")
        options.add_argument("--ignore-ssl-errors=yes")
        options.add_argument("--ignore-certificate-errors")
 
        self.driver = webdriver.Chrome(service=Service(), options=options)
        
        self.driver.implicitly_wait(30)

    def extract_info(self, element):
        """
        Extracts information from an attribute class.

        Args:
            element: The element to extract information from.

        Returns:
            A tuple containing the extracted information:
            - name: The name extracted from the element.
            - detectionDate: The date when the post was published.
            - post_link: The link information extracted from the post, or None if not found.
        """
        
        name = (
            element
            .find_element(By.CLASS_NAME, "entry-title")
            .find_element(By.TAG_NAME, "a")
            .text
        )

        try:
            detectionDateText = (
                element
                .find_element(By.CLASS_NAME, "entry-date")
                .find_element(By.TAG_NAME, "time")
                .text
                .strip()
            )
            detectionDate = (
                datetime
                .strptime(detectionDateText, "%b %d, %Y")
                .replace(tzinfo=timezone.utc)
                .strftime(ScriptsUtils.date_pattern)
            )
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        
        post_link = (
            element
            .find_element(By.CLASS_NAME, "entry-title")
            .find_element(By.TAG_NAME, "a")
            .get_attribute("href")
        )
        
        return name, detectionDate, post_link

    def get_date(self, element):
        """
        Retrieves the date from the post banner element on a webpage.
        """
        return None

    def download(self):
        """
        Downloads the information from the Arcus Media leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:

            self.driver.set_page_load_timeout(60)
            url = "http://arcuufpr5xxbbkin4mlidt7itmr6znlppk63jbtkeguuhszmc5g7qdyd.onion"  ### Arcus Media URL
            self.driver.get(url)

            if ScriptsUtils.check_seized_page(self.driver):
                print("The page has been seized")
                return

            if args.mode == "full":
                # Scroll to the bottom of the page
                print("Scrolling to the bottom of the page")
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(10)
                pagination = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "kenta-pagination"))
                )
                last_page = int(pagination.find_elements(By.TAG_NAME, "a")[-2].text.strip())

            elif args.mode == "daily":
                # Take the first 10 victims
                print("Taking the first 10 victims")
                last_page = 1

            for page in range(1, last_page + 1):
                print(f"Processing page {page} of {last_page}")
                self.driver.get(f"{url}?paged={page}")

                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "card-wrapper.w-full"))
                )
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(10)

                victimList = (
                    self.driver
                    .find_elements(By.CLASS_NAME, "card-wrapper.w-full")
                )

                victimsInfo = []
                for victim in victimList:
                    result = {}
                    name, detectionDate, post_link = self.extract_info(victim)
                    result["url"] = post_link
                    result["group"] = "Arcus Media"
                    result["companyName"] = name
                    result["network"] = "Tor"
                    result["detectionDate"] = detectionDate
                    result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                    victimsInfo.append(result)

                    if args.mode == "daily" and len(victimsInfo) >= 10:
                        break

                for victimInfo in victimsInfo:
                    self.driver.get(victimInfo["url"])
                    parsed_url = url_model.parse(victimInfo["url"])
                    victimInfo.update(parsed_url.__dict__)
                    victimInfo["port"] = 80
                    
                    element = WebDriverWait(self.driver, 30).until(
                        EC.presence_of_element_located((By.CLASS_NAME, "kenta-article-content"))
                    )

                    html = self.driver.page_source
                    ransomwarePost = "\n".join(
                        [
                            p.text.strip()
                            for p in element
                                .find_elements(By.TAG_NAME, "p")
                        ]
                    )

                    urls = (
                        URLExtract()
                        .find_urls(ransomwarePost)
                    )
                    if urls:
                        companyLink = urls[0]
                    
                    soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                    text = soup.get_text()

                    victimInfo.update(
                        {
                            "pageTitle": self.driver.title,
                            "companyLink": companyLink,
                            "ransomwarePost": ransomwarePost,
                            "postSignature": hashlib.sha256(
                                victimInfo["url"].encode("utf-8")
                            ).hexdigest(),
                            "html": self.driver.page_source,
                            "text": text,
                            "ransomwareGroup": "arcus media",
                        }
                    )
                    sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"])

                    victimInfo["sha1sum"] = sha1sum
                    victimInfo["sha256sum"] = sha256sum

                    image = ScriptsUtils.save_screenshot(self.driver)
                    self.success |= self.elastic.save_victim(victimInfo, image)
        except Exception as e:
            message, m_type = ScriptsUtils.manage_exception(e)
            print(message)
            if  m_type == 1 and self.tries != 0:
                print("Trying to connect again...")
                self.tries -= 1
                self.download()
            if self.success:
                exit(0)
            else:
                exit(1)
        finally:
            self.driver.quit()
            print("Driver quit")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        dest="mode",
        type=str,
        help="Download mode. Can be 'full' or 'daily'.",
        default="daily",
    )

    args = parser.parse_args()
    arcus_media_scraper = ArcusMediaScraper(args)
    arcus_media_scraper.download()
