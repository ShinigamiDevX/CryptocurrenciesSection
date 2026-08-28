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
Data collection script for Termite ransomware group. 
Onion Service URL: http://termiteuslbumdge2zmfmfcsrvmvsfe4gvyudc5j6cdnisnhtftvokid.onion 

name: termite.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class TermiteScraper:
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
            - companyLink: The company link extracted from the element, or None if not found.
            - post_link: The link information extracted from the post, or None if not found.
        """
        name = (
            element
            .find_element(By.CLASS_NAME, "no-overflow")
            .find_element(By.TAG_NAME, "h3")
            .text
        )
        post_link = element.get_attribute("href")
        urls = (
            URLExtract()
            .find_urls(element.find_element(By.CLASS_NAME, "no-overflow").find_element(By.TAG_NAME, "h2").text)
        )
        if urls:
            companyLink = urls[0]
        try:
            detected_date = element.find_element(By.CLASS_NAME, "inline-flex.items-end").text.strip()
            detectionDate = datetime.strptime(detected_date, "%m/%d/%Y, %I:%M:%S %p").replace(
                tzinfo=timezone.utc
            ).strftime(ScriptsUtils.date_pattern)
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        
        return name, detectionDate, companyLink, post_link

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        Hunters does not have a date on the post banner, so it returns the current date.
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self, victim):
        """
        Downloads the information from the Termite leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:
            victimInfo = {}
            name, detectionDate, companyLink, post_link = self.extract_info(victim)
            victimInfo["url"] = post_link
            victimInfo["companyName"] = name
            victimInfo["companyLink"] = companyLink
            victimInfo["detectionDate"] = detectionDate
            victimInfo["group"] = "Termite"
            victimInfo["network"] = "Tor"
            victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

            parsed_url = url_model.parse(victimInfo["url"])
            victimInfo.update(parsed_url.__dict__)
            victimInfo["port"] = 80
            victim.click()
            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "my-4"))
            )

            html = self.driver.page_source
            soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
            text = soup.get_text()

            ransomwarePost = self.driver.find_element(By.CLASS_NAME, "my-4").text
            ransomwarePost += "\n" + self.driver.find_element(By.CLASS_NAME, "bg-white").text

            victimInfo.update(
                {
                    "pageTitle": self.driver.title,
                    "ransomwarePost": ransomwarePost,
                    "postSignature": hashlib.sha256(
                        victimInfo["url"].encode("utf-8")
                    ).hexdigest(),
                    "html": self.driver.page_source,
                    "text": text,
                    "ransomwareGroup": "termite",
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

    def main(self):
        """
        Main function that performs navigation and data collection into the leak datasite,
        all pages into full mode and the first one into daily mode.

        """
        try:
            self.driver.set_page_load_timeout(60)
            url = "http://termiteuslbumdge2zmfmfcsrvmvsfe4gvyudc5j6cdnisnhtftvokid.onion/"
            self.driver.get(url)
            WebDriverWait(self.driver, 180).until(
                EC.presence_of_element_located((By.CLASS_NAME, "min-h-36"))
            )
            
            if ScriptsUtils.check_seized_page(self.driver):
                    print("The page has been seized")
                    return

            if self.args.mode == "daily":
                print("Taking the first 10 victims")
                n_pageLinks = 1
            elif self.args.mode == "full":
                print("Scrolling all pages")
                n_pageLinks = len(self.driver.find_elements(By.CLASS_NAME, "min-h-36"))

            # Recolect all the pages
            for i in range(n_pageLinks):
                print("Downloading page "+str(i))
                self.driver.get(url)
                WebDriverWait(self.driver, 120).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "min-h-36"))
                )
                victim = n_pageLinks[i]
                if (self.args.mode == "daily" and i >= 10):
                    break
                self.download(victim)
    
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
    termite_scraper = TermiteScraper(args)
    termite_scraper.main()
