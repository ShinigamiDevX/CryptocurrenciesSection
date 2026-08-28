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
Data collection script for Weyhro ransomware group. 
Onion Service URL: http://weyhro27ruifvuqkk3hxzcrtxv2lsalntxgkv6q2j3znkhdqudz54rqd.onion 

name: weyhro.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class WeyhroScraper:
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
            - detectionDate: The detection date extracted from the element, or None if not found.
            - post_link: The link information extracted from the post, or None if not found.
            - info: The info extracted from the element.
        """

        name = (
            element
            .find_element(By.TAG_NAME, "h2")
            .text
            .strip()
        )

        try:
            date_str = element.find_element(By.TAG_NAME, "time").text.strip()
            detectionDate = datetime.strptime(date_str, "%b %d, %Y").replace(tzinfo=timezone.utc).strftime(ScriptsUtils.date_pattern)
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        
        post_link = element.get_attribute("href")

        info = (
            element
            .find_element(By.TAG_NAME, "p")
            .text
            .strip()
        )

        return name, detectionDate, post_link, info

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Weyhro leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://weyhro27ruifvuqkk3hxzcrtxv2lsalntxgkv6q2j3znkhdqudz54rqd.onion/leaks"  ### Weyhro URL

        try:
            self.driver.get(url)
            element = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "grid.grid-cols-1"))
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

            pageLinksElements = element.find_elements(By.TAG_NAME, "a")

            victimsInfo = []
            for p in pageLinksElements:
                result = {}
                name, detectionDate, post_link, info = self.extract_info(p)
                result["companyName"] = name
                result["detectionDate"] = detectionDate
                result["url"] = post_link
                result["group"] = "Weyhro"
                result["network"] = "Tor"
                result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                result["ransomwarePost"] = info
                victimsInfo.append(result)

                if args.mode == "daily" and len(victimsInfo) > 10:
                    break

            for victimInfo in victimsInfo:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "mx-auto.max-w-7xl"))
                )

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                urls = (
                    URLExtract()
                    .find_urls(element.find_elements(By.TAG_NAME, "a")[-1].get_attribute("href"))
                )
                if urls:
                    victimInfo["companyLink"] = urls[0]

                victimInfo["ransomwarePost"] += "\n" + element.find_element(By.CLASS_NAME, "mt-6.text-lg").text.strip()
                victimInfo["ransomwarePost"] += "\nFiles: " + element.find_element(By.TAG_NAME, "a").get_attribute("href")
                victimInfo["ransomwarePost"] += "\n\n" + self.driver.find_element(By.TAG_NAME, "article").text.strip()

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "weyhro",
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
    weyhro_scraper = WeyhroScraper(args)
    weyhro_scraper.download()
