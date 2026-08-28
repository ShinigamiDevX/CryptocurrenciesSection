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
from utils.utils import scriptsUtils

"""
Data collection script for MetaEncryptor ransomware group. 
Onion Service URL: http://metacrptmytukkj7ajwjovdpjqzd7esg5v3sg344uzhigagpezcqlpyd.onion 

name: metaencryptor.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class MetaEncryptorScraper:
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
            - deadline: The deadline extracted from the element, or None if not found.
            - post_link: The link information extracted from the post, or None if not found.
        """

        name = (
            element.find_element(By.CLASS_NAME, "card-header").text
        )

        return name

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        Hunters does not have a date on the post banner, so it returns the current date.
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the MetaEncryptor leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:

            self.driver.set_page_load_timeout(60)
            url = "http://metacrptmytukkj7ajwjovdpjqzd7esg5v3sg344uzhigagpezcqlpyd.onion"  ### MetaEncryptor URL
            self.driver.get(url)
            WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "col.d-flex"))
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

            victimList = self.driver.find_elements(By.CLASS_NAME, "col.d-flex")
            # Iterate over the list of victims
            for i, p in enumerate(victimList):
                victimInfo = {}
                victimInfo["url"] = url
                name = self.extract_info(p)
                victimInfo["companyName"] = name
                victimInfo["url"] = url
                victimInfo["group"] = "MetaEncryptor"
                victimInfo["network"] = "Tor"
                victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

                if args.mode == "daily" and i >= 10:
                    break

                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                body = p.find_element(By.CLASS_NAME, "card-body")
                ransomwarePost = body.find_element(By.CLASS_NAME, "card-text").text
                if (len(p.find_elements(By.CLASS_NAME, "card-footer")) != 0):
                    ransomwarePost += "\n".join(li.text for li in body.find_elements(By.TAG_NAME, "li")) + " Files: " + p.find_element(By.CLASS_NAME, "card-footer").find_element(By.TAG_NAME, "a").get_attribute("href")
                    victimInfo["companyLink"] = p.find_element(By.CLASS_NAME, "card-footer").find_elements(By.TAG_NAME, "a")[1].get_attribute("href")

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "detectionDate": self.get_date(self.driver),
                        "postSignature": hashlib.sha256(str(victimInfo["url"]+victimInfo["companyName"]).encode("utf-8")
                        ).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "metaencryptor",
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
    metaencryptor_scraper = MetaEncryptorScraper(args)
    metaencryptor_scraper.download()
