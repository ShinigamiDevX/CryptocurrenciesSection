import argparse
import hashlib
import os
import time
from datetime import datetime, timezone

from bs4 import BeautifulSoup
from dbModules.databaseMethods import databaseMethods
from models.url import url as url_model
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium_stealth import stealth
from urlextract import URLExtract
from utils.utils import scriptsUtils

"""
Data collection script for Sarcoma ransomware group. 
Onion Service URL: http://sarcomawmawlhov7o5mdhz4eszxxlkyaoiyiy2b5iwxnds2dmb4jakad.onion 

name: sarcoma.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class SarcomaScraper:
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
        """

    def get_date(self, element):
        """
        Retrieves the date from the post banner element on a webpage. 
        Hunters does not have a date on the post banner, so it returns the current date.
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self, victimList, url):
        """
        Downloads the information from the Sarcoma leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:
            for victim in victimList:
                victimInfo = {}
                victimInfo["url"] = url
                victimInfo["group"] = "Sarcoma"
                victimInfo["network"] = "Tor"
                victimInfo["ingestionDate"] = victimInfo["detectionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                text = victim.find_element(By.CLASS_NAME, "card-text").text
                if "Site:" in text:
                    urls = (
                        URLExtract()
                        .find_urls(text.split("Site:")[-1].split("\n")[0].strip())
                    )
                    if urls:
                        victimInfo["companyLink"] = urls[0]

                info_button = victim.find_element(By.CLASS_NAME, "card-footer").find_element(By.TAG_NAME, "button")
                self.driver.execute_script("arguments[0].click();", info_button)
                time.sleep(2)
                info_card = self.driver.find_element(By.ID, info_button.get_attribute("data-bs-target")[1:])

                victimInfo["companyName"] = info_card.find_element(By.CLASS_NAME, "modal-title").text.strip()
                ransomwarePost = info_card.find_element(By.CLASS_NAME, "modal-body").text.strip()
                
                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(
                            str(victimInfo["url"]+victimInfo["companyName"])
                                .encode("utf-8")
                        ).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "sarcoma",
                    }
                )
                sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"]+victimInfo["companyName"])

                victimInfo["sha1sum"] = sha1sum
                victimInfo["sha256sum"] = sha256sum

                image = ScriptsUtils.save_screenshot(self.driver)
                self.success |= self.elastic.save_victim(victimInfo, image)

        except Exception as e:
            message, m_type = ScriptsUtils.manage_exception(e)
            print(message)

    def main(self):
        """
        Main function that performs navigation and data collection into the leak datasite,
        all pages into full mode and the first one into daily mode.

        """
        try:
            self.driver.set_page_load_timeout(60)
            url = "http://sarcomawmawlhov7o5mdhz4eszxxlkyaoiyiy2b5iwxnds2dmb4jakad.onion/"
            self.driver.get(url)
            element = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.XPATH, "/html/body/div[2]"))
            )
            page_links = element.find_elements(By.TAG_NAME, "a")
            if not page_links:
                return
            if ScriptsUtils.check_seized_page(self.driver):
                    print("The page has been seized")
                    return

            if self.args.mode == "daily":
                print("Taking the first 10 victims")
                page_links = 1
            elif self.args.mode == "full":
                print("Scrolling all pages")

            # Recolect all the pages
            for page in range(1, int(page_links[-1].text) + 1):
                self.driver.get(f"{url}?page={page}")
                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "sg-form.card"))
                )
                n_pageLinks = self.driver.find_elements(By.CLASS_NAME, "sg-form.card")
                if (self.args.mode == "daily" and len(n_pageLinks) >= 10):
                    n_pageLinks = n_pageLinks[:10]
                    self.download(n_pageLinks)
                    break
                self.download(n_pageLinks, url)
    
        except Exception as e:
            message, m_type = ScriptsUtils.manage_exception(e)
            print(message)
            if  m_type == 1 and self.tries != 0:
                print("Trying to connect again...")
                self.tries -= 1
                self.main()
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
    sarcoma_scraper = SarcomaScraper(args)
    sarcoma_scraper.main()
