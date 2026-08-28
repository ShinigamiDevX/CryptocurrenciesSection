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
Data collection script for Bqtlock ransomware group. 
Onion Service URL: http://yywhylvqeqynzik6ibocb53o2nat7lmzn5ynjpar3stndzcgmy6dkgid.onion 

name: bqtlock.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class BqtlockScraper:
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
        Downloads the information from the Bqtlock leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://yywhylvqeqynzik6ibocb53o2nat7lmzn5ynjpar3stndzcgmy6dkgid.onion"  ### Bqtlock URL

        try:
            self.driver.get(url)
            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "company-card"))
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

            pageLinksElements = self.driver.find_elements(By.CLASS_NAME, "company-card")

            for i, p in enumerate(pageLinksElements):

                if args.mode == "daily" and i >= 10:
                    break

                victimInfo = {}
                victimInfo["companyName"] = p.find_element(By.CLASS_NAME, "company-header").find_element(By.TAG_NAME, "h3").text.strip()
                victimInfo["url"] = url
                victimInfo["group"] = "Bqtlock"
                victimInfo["network"] = "Tor"
                victimInfo["ingestionDate"] = victimInfo["detectionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                ransomwarePost = p.find_element(By.CLASS_NAME, "company-info").text.strip()
                urls = URLExtract().find_urls(ransomwarePost)
                if urls:
                    victimInfo["companyLink"] = urls[0]

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(
                            str(victimInfo["url"]+victimInfo["companyName"])
                            .encode("utf-8")).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "bqtlock",
                    }
                )
                sha1sum, sha256sum = ScriptsUtils.get_hashes(str(victimInfo["html"]+victimInfo["ransomwarePost"]))

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
    bqtlock_scraper = BqtlockScraper(args)
    bqtlock_scraper.download()
