import argparse
import hashlib
import os
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
Data collection script for Kairos ransomware group. 
Onion Service URL: http://nerqnacjmdy3obvevyol7qhazkwkv57dwqvye5v46k5bcujtfa6sduad.onion 

name: kairos.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class KairosScraper:
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
        """
        try:
            date_str = element.find_element(By.CLASS_NAME, "date").text.strip()
            return datetime.strptime(date_str, "%m/%d/%Y %I:%M:%S %p").replace(tzinfo=timezone.utc).strftime(ScriptsUtils.date_pattern)
        except:
            return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Kairos leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://nerqnacjmdy3obvevyol7qhazkwkv57dwqvye5v46k5bcujtfa6sduad.onion/posts/"  ### Kairos URL

        try:
            self.driver.get(url)
            pageLinksElements = []
            while True:
                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "card"))
                )

                pageLinksElements += [c.get_attribute("href") for c in self.driver.find_elements(By.CLASS_NAME, "card")]

                if args.mode == "daily" and len(pageLinksElements) > 10:
                    pageLinksElements = pageLinksElements[:10]
                    break

                nextButton = self.driver.find_elements(By.CLASS_NAME, "page-link")[-1]
                if nextButton.get_attribute("href") is None:
                    break
                self.driver.get(nextButton.get_attribute("href"))

            if ScriptsUtils.check_seized_page(self.driver):
                print("The page has been seized")
                return
            
            if args.mode == "full":
                # Scroll to the bottom of the page
                print("Scrolling to the bottom of the page")
                self.driver.execute_script(
                    "window.scrollTo(0, document.body.scrollHeight);"
                )

            elif args.mode == "daily":
                # Take the first 10 victims
                print("Taking the first 10 victims")

            victimsInfo = []
            for p in pageLinksElements:
                result = {}
                result["url"] = p
                result["group"] = "Kairos"
                result["network"] = "Tor"
                result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                victimsInfo.append(result)

                if args.mode == "daily" and len(victimsInfo) > 10:
                    break

            for victimInfo in victimsInfo:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "text-block"))
                )

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                victimInfo["companyName"] = element.find_element(By.CLASS_NAME, "title").text.split("\\")[0].strip()
                ransomwarePost = element.find_element(By.CLASS_NAME, "desc").text.strip()
                if "ebsite" in ransomwarePost:
                    victimInfo["companyLink"] = ransomwarePost.split("ebsite")[1].split("\n")[0].strip()
                    while victimInfo["companyLink"].startswith(":"):
                        victimInfo["companyLink"] = victimInfo["companyLink"][1:].strip()
                    urls = (
                        URLExtract()
                        .find_urls(victimInfo["companyLink"])
                    )
                    if urls:
                        victimInfo["companyLink"] = urls[0]

                
                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "detectionDate": self.get_date(element),
                        "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "kairos",
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
    kairos_scraper = KairosScraper(args)
    kairos_scraper.download()
