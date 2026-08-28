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
Data collection script for Inc Ransom ransomware group. 
Onion Service URL: http://incblog6qu4y4mm4zvw5nrmue6qbwtgjsxpw6b7ixzssu36tsajldoad.onion/ 

name: inc_ransom.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class IncRansomScraper:
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
        """

        return None

    def get_date(self, element):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        try:
            date_text = element.text.strip()
            format_str = "%d.%m.%Y %H:%M"
            date = datetime.strptime(date_text, format_str).replace(
                    tzinfo=timezone.utc).strftime(ScriptsUtils.date_pattern)
        except:
            date = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        
        return date
    
    def download(self):
        """
        Downloads the information from the Meow leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:

            self.driver.set_page_load_timeout(60)
            url = "http://incblog6qu4y4mm4zvw5nrmue6qbwtgjsxpw6b7ixzssu36tsajldoad.onion"  ### Inc Ransom URL
            self.driver.get(url)
            WebDriverWait(self.driver, 120).until(
                EC.presence_of_element_located((By.CLASS_NAME, "more__container"))
            )

            if ScriptsUtils.check_seized_page(self.driver):
                print("The page has been seized")
                return
            
            if args.mode == "full":
                # Scroll to the bottom of the page
                print("Scrolling to the bottom of the page")
                for i in range(8):
                    if len(self.driver.find_elements(By.CLASS_NAME, "more__container")) == 0:
                        break
                    self.driver.find_element(By.CLASS_NAME, "more__container").click()
                    time.sleep(2)
                    
            elif args.mode == "daily":
                # Take the first 10 victims
                print("Taking the first 10 victims")

            pagesLink = [a.get_attribute("href") for a in self.driver.find_elements(By.CLASS_NAME, "announcement__container")]

            victims = []
            for p in pagesLink:
                result = {}
                result["url"] = p
                result["group"] = "Inc Ransom"
                result["network"] = "Tor"
                result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                victims.append(result)

                if args.mode == "daily" and len(victims) >= 10:
                    break
            
            for victimInfo in victims:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                time.sleep(10)
                content = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "action__container"))
                )

                spans = content.find_element(By.CLASS_NAME, "text-muted").find_elements(By.TAG_NAME, "span")

                victimInfo["companyName"] = spans[0].text
                if "(" in victimInfo["companyName"]:
                    urls = URLExtract().find_urls(victimInfo["companyName"].split("(")[1].split(")")[0].strip())
                else:
                    urls = URLExtract().find_urls(victimInfo["companyName"])
                if urls:
                    victimInfo["companyLink"] = urls[0]

                victimInfo["detectionDate"] = self.get_date(spans[1])

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                ransomwarePost = "".join(span.text for span in self.driver.find_elements(By.CLASS_NAME, "text-white.text-sm.break-words"))

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")
                        ).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "inc ransom",
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
    inc_ransom_scraper = IncRansomScraper(args)
    inc_ransom_scraper.download()
