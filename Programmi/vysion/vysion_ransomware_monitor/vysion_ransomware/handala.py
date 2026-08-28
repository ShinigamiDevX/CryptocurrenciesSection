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
from utils.utils import scriptsUtils

"""
Data collection script for Handala ransomware group. 
Onion Service URL: http://vmjfieomxhnfjba57sd6jjws2ogvowjgxhhfglsikqvvrnrajbmpxqqd.onion/

name: handala.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class HandalaScraper:
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
            element.find_element(By.CLASS_NAME, "wp-block-post-title")
            .find_element(By.TAG_NAME, "a")
            .text.strip()
        )
        post_link = (
            element.find_element(By.CLASS_NAME, "wp-block-post-title")
            .find_element(By.TAG_NAME, "a")
            .get_attribute("href")
        )
        try:
            detectionDateText = (
                element.find_element(By.CLASS_NAME, "wp-block-post-date")
                .find_element(By.TAG_NAME, "time")
                .get_attribute("datetime")
                .replace("T", " ")
            )
            detectionDate = (
                datetime.strptime(detectionDateText, ScriptsUtils.date_pattern)
                .replace(tzinfo=timezone.utc)
                .strftime(ScriptsUtils.date_pattern)
            )
        except Exception:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        
        return name, detectionDate, post_link
    
    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        Cactus does not have a date on the post banner, so it returns the current date.
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self, pagesLinks):
        """
        Downloads the information from the Handala leak site.

        Args:
            pagesLinks: A list of URLs to the victim pages.
        """

        victims = []
        for p in pagesLinks:
            result = {}
            name, detectionDate, post_link = self.extract_info(p)
            result["companyName"] = name
            result["detectionDate"] = detectionDate
            result["url"] = post_link
            result["group"] = "Handala"
            result["network"] = "Clearnet"
            result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
            victims.append(result)

            if args.mode == "daily" and len(victims) >= 10:
                break

        for victimInfo in victims:
            try:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80
                
                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "entry-content"))
                )

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                ransomwarePost = element.text

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(
                            victimInfo["url"].encode("utf-8")
                        ).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "handala",
                    }
                )

                sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"])

                victimInfo["sha1sum"] = sha1sum
                victimInfo["sha256sum"] = sha256sum

                image = ScriptsUtils.save_screenshot(self.driver)
                self.success |= self.elastic.save_victim(victimInfo, image)

            except Exception as e:
                print(ScriptsUtils.manage_exception(e))

    def main(self):
        """
        Main function that performs navigation and data collection into the leak datasite,
        all pages into full mode and the first one into daily mode.

        """
        try:
            self.driver.set_page_load_timeout(60)
            url = "http://vmjfieomxhnfjba57sd6jjws2ogvowjgxhhfglsikqvvrnrajbmpxqqd.onion/"
            self.driver.get(url)

            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "wp-block-query-pagination-numbers"))
            )
            
            if ScriptsUtils.check_seized_page(self.driver):
                    print("The page has been seized")
                    return

            if args.mode == "full":
                # Scroll to the bottom of the page
                print("Scrolling all pages")
                range_n = int(
                    self.driver.find_element(By.CLASS_NAME, "wp-block-query-pagination-numbers")
                    .find_elements(By.CLASS_NAME, "page-numbers")[-1]
                    .text
                )

            elif args.mode == "daily":
                # Take the first 10 victims
                print("Taking the first 10 victims")
                range_n = 1

            # Recolect all the pages
            for i in range(1, range_n+1):
                self.driver.get(url+"?paged="+str(i))
                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "wp-block-post"))
                )
                pagesLinks = [a.find_element(By.CLASS_NAME, "wp-block-group") for a in self.driver.find_elements(By.CLASS_NAME, "wp-block-post")]
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
    handala_scraper = HandalaScraper(args)
    handala_scraper.main()