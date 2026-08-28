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
Data collection script for Monti ransomware group. 
Onion Service URL: http://mblogci3rudehaagbryjznltdp33ojwzkq6hn2pckvjq33rycmzczpid.onion/ 

name: monti.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class MontiScraper:
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
            - detectionDate: The date extracted from the element, or None if not found.
            - post_link: The link information extracted from the post, or None if not found.
            - info: only if present in the post
        """

        name = (
            element
            .find_element(By.CLASS_NAME, "col")
            .find_element(By.TAG_NAME, "h5").text 
        )
        try:
            detectionDate_text = element.find_element(By.CLASS_NAME, "col-auto.published").text
            detectionDate = (
                datetime.strptime(detectionDate_text, "%Y-%m-%d %H:%M:%S")
                .replace(tzinfo=timezone.utc)
                .strftime(ScriptsUtils.date_pattern)
            )
        except:
                detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        post_link = (
            element
            .get_attribute("href")
        )
        info = (
            element
            .find_element(By.CLASS_NAME, "col-auto.published")
            .text
        )

        return name, detectionDate, post_link, info

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Monti leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:

            self.driver.set_page_load_timeout(60)
            url = "http://mblogci3rudehaagbryjznltdp33ojwzkq6hn2pckvjq33rycmzczpid.onion"  ### Monti URL
            self.driver.get(url)
            WebDriverWait(self.driver, 120).until(
                EC.presence_of_element_located((By.TAG_NAME, "a"))
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

            pagesLink = self.driver.find_elements(By.TAG_NAME, "a")
            victims = []
            for p in pagesLink:
                result = {}
                name, detectionDate, post_link, info = self.extract_info(p)
                result["companyName"] = name
                result["detectionDate"] = detectionDate
                result["url"] = post_link
                urls = URLExtract.find_urls(info)
                if urls:
                    result["companyLink"] = urls[0]
                result["ransomwarePost"] = info
                result["group"] = "Monti"
                result["network"] = "Tor"
                result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                victims.append(result)

                if args.mode == "daily" and len(victims) >= 10:
                    break

            tags_replace = ["<br>", "&nbsp;", "&amp;", "\t"]
            for victimInfo in victims:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.TAG_NAME, "p"))
                )

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                victimInfo["ransomwarePost"] += " " + self.driver.find_element(By.TAG_NAME, "h2").text
                victimInfo["ransomwarePost"] += " ".join(p.get_attribute("innerHTML") for p in self.driver.find_elements(By.TAG_NAME, "p")[:-1])
                for tag in tags_replace:
                    victimInfo["ransomwarePost"] = victimInfo["ransomwarePost"].replace(tag, " ")

                data_links = self.driver.find_elements(By.TAG_NAME, "a")[1:-1] #remove home links
                if data_links:
                    victimInfo["ransomwarePost"] += " Download links:" + " ".join(a.get_attribute("href") for a in data_links)

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")
                        ).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "monti",
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
    monti_scraper = MontiScraper(args)
    monti_scraper.download()
