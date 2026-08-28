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
Data collection script for Bashe ransomware group. 
Onion Service URL: http://basheqtvzqwz4vp6ks5lm2ocq7i6tozqgf6vjcasj4ezmsy4bkpshhyd.onion 

name: bashe.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class BasheScraper:
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

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Bashe leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://basheqtvzqwz4vp6ks5lm2ocq7i6tozqgf6vjcasj4ezmsy4bkpshhyd.onion"  ### Bashe URL

        try:
            self.driver.get(url)
            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "segment__box"))
            )

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

            pageLinksElements = [s.get_attribute("onclick").split("/")[1][:-1] for s in self.driver.find_elements(By.CLASS_NAME, "segment")]

            victimsInfo = []
            for p in pageLinksElements:
                result = {}
                result["url"] = url + p
                result["group"] = "Bashe"
                result["network"] = "Tor"
                result["ingestionDate"] = result["detectionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                victimsInfo.append(result)

                if args.mode == "daily" and len(victimsInfo) > 10:
                    break

            for victimInfo in victimsInfo:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "offer__text"))
                )

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                victimInfo["companyName"] = victimInfo["companyLink"] = element.text.strip()
                if "SOLD" in element.text:
                    victimInfo["companyName"] = element.text.split(" ")[0].strip()
                    urls = URLExtract().find_urls(element.text.strip())
                    if urls:
                        victimInfo["companyLink"] = urls[0]

                ransomwarePost = self.driver.find_element(By.CLASS_NAME, "dsc__text").text
                published = self.driver.find_elements(By.CLASS_NAME, "block__published")
                if len(published) != 0:
                    ransomwarePost += "\nDownload: " + published[0].find_element(By.TAG_NAME, "a").get_attribute("href")

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "bashe",
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
    bashe_scraper = BasheScraper(args)
    bashe_scraper.download()
