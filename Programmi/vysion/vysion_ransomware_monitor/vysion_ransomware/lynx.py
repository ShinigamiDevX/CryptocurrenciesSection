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
Data collection script for Lynx ransomware group. 
Onion Service URL: http://lynxblogxutufossaeawlij3j3uikaloll5ko6grzhkwdclrjngrfoid.onion 

name: lynx.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class LynxScraper:
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
            - companyLink: The company link extracted from the post, or None if not found.
        """
        name = (
            element
            .find_element(By.CLASS_NAME, "chat__block-title")
            .text
        )
        try:
            post_link = element.find_element(By.TAG_NAME, "a").get_attribute("href")
        except:
            return name, None, None, None
        
        urls = (
            URLExtract()
            .find_urls(name)
        )
        if urls:
            companyLink = urls[0]
        
        try:
            detectionDateText = element.find_element(By.CLASS_NAME, "chat__block-date").text.split(":")[-1].strip()
            detectionDate = (
                datetime.strptime(detectionDateText, "%d/%m/%Y")
                .replace(tzinfo=timezone.utc)
                .strftime("%Y-%m-%dT%H:%M:%S")
            )
        except Exception as e:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        
        return name, detectionDate, post_link, companyLink

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        Hunters does not have a date on the post banner, so it returns the current date.
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self, victimList):
        """
        Downloads the information from the Lynx leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:
            victimsInfo = []
            for victim in victimList:
                result = {}
                name, detectionDate, post_link, companyLink = self.extract_info(victim)
                if post_link is None:
                    continue
                result["url"] = post_link
                result["companyName"] = name
                result["detectionDate"] = detectionDate
                result["companyLink"] = companyLink
                result["group"] = "Lynx"
                result["network"] = "Tor"
                result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                victimsInfo.append(result)

            for victimInfo in victimsInfo:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80
                time.sleep(5)
                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "detailed"))
                )

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                ransomwarePost = element.text.strip()

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(
                            victimInfo["url"].encode("utf-8")
                        ).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "lynx",
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
            url = "http://lynxblogxutufossaeawlij3j3uikaloll5ko6grzhkwdclrjngrfoid.onion/leaks"
            self.driver.get(url)
            while True:
                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "news__block.chat__block"))
                )
                time.sleep(5)
                if self.args.mode == "daily":
                    break
                buttons = self.driver.find_elements(By.CLASS_NAME, "button.button-blue")
                if buttons and buttons[-1].text == "Show more":
                    buttons[-1].click()
                    print("Scrolling down to load more entries...")
                else:
                    break
            
            if ScriptsUtils.check_seized_page(self.driver):
                    print("The page has been seized")
                    return

            if self.args.mode == "daily":
                print("Taking the first 10 victims")
            elif self.args.mode == "full":
                print("Scrolling all pages")


            pagesLinks = self.driver.find_elements(By.CLASS_NAME, "news__block.chat__block")
            if (self.args.mode == "daily" and len(pagesLinks) >= 10):
                pagesLinks = pagesLinks[:10]
                self.download(pagesLinks)
            self.download(pagesLinks)
    
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
    qilin_scraper = QilinScraper(args)
    qilin_scraper.main()
