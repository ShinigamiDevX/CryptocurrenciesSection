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
Data collection script for Cicada3301 ransomware group. 
Onion Service URL: http://cicadabv7vicyvgz5khl7v2x5yygcgow7ryy6yppwmxii4eoobdaztqd.onion 

name: cicada3301.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class Cicada3301Scraper:
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
            - company_link: The link to the company, or None if not found.
        """

        name = (
            element
            .find_element(By.CLASS_NAME, "text-yellow-500")
            .text
            .strip()
        )

        try:
            date_str = element.find_elements(By.CLASS_NAME, "rounded-md.inline-block.mb-1")[1].find_element(By.CLASS_NAME, "text-white").text.strip()
            detectionDate = datetime.strptime(date_str, "%B %d, %Y").replace(tzinfo=timezone.utc).strftime(ScriptsUtils.date_pattern)
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        
        post_link = (
            element
            .find_element(By.CLASS_NAME, "inline-flex")
            .get_attribute("href")
        )
        urls = (
            URLExtract()
            .find_urls(element.find_element(By.TAG_NAME, "a").get_attribute("href"))
        )
        if urls:
            company_link = urls[0]
        else:
            company_link = None        

        return name, detectionDate, post_link, company_link

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Cicada3301 leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://cicadabv7vicyvgz5khl7v2x5yygcgow7ryy6yppwmxii4eoobdaztqd.onion/"  ### Cicada3301 URL

        try:
            self.driver.get(url)
            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "block.relative"))
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

            pageLinksElements = self.driver.find_elements(By.CLASS_NAME, "block.relative")

            victimsInfo = []
            for p in pageLinksElements:
                result = {}
                name, detectionDate, post_link, company_link = self.extract_info(p)
                result["companyName"] = name
                result["detectionDate"] = detectionDate
                if company_link:
                    result["companyLink"] = company_link
                result["url"] = post_link
                result["group"] = "Cicada3301"
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
                    EC.presence_of_element_located((By.CLASS_NAME, "pr-10"))
                )

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                ransomwarePost = element.text.strip()

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "cicada3301",
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
    cicada3301_scraper = Cicada3301Scraper(args)
    cicada3301_scraper.download()
