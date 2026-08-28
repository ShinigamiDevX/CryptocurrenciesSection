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
Data collection script for Killsec ransomware group. 
Onion Service URL: http://ks5424y3wpr5zlug5c7i6svvxweinhbdcqcfnptkfcutrncfazzgz5id.onion 

name: killsec.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class KillsecScraper:
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
            
        return None

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        Hunters does not have a date on the post banner, so it returns the current date.
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Killsec leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        try:

            self.driver.set_page_load_timeout(60)
            url = "http://ks5424y3wpr5zlug5c7i6svvxweinhbdcqcfnptkfcutrncfazzgz5id.onion/posts.php"  ### Killsec URL
            self.driver.get(url)
            element = WebDriverWait(self.driver, 60).until(
                EC.presence_of_element_located((By.TAG_NAME, "side"))
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

            pageLinks = [element.get_attribute("href") for element in element.find_elements(By.TAG_NAME, "a") if element.get_attribute("href")]
            for i, p in enumerate(pageLinks):
                victimInfo = {}
                victimInfo["url"] = p
                
                victimInfo["group"] = "Killsec"
                victimInfo["network"] = "Tor"
                victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

                if args.mode == "daily" and i >= 10:
                    break

                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.TAG_NAME, "vpost"))
                )

                victimInfo["companyName"] = element.find_element(By.TAG_NAME, "st").text.strip()

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                cards = element.find_elements(By.TAG_NAME, "card")
                ransomwarePost = "\n\n".join(card.text for card in cards)
                ransomwarePost += "\n\n" + element.find_element(By.TAG_NAME, "discls").text

                urls = URLExtract().find_urls(victimInfo["companyName"] + " " + ransomwarePost)
                if urls:
                    victimInfo["companyLink"] = urls[0]

                postSignature = hashlib.sha256(str(victimInfo["url"]+victimInfo["companyName"]).encode("utf-8")).hexdigest()
                sha1sum, sha256sum = ScriptsUtils.get_hashes(str(self.driver.page_source+victimInfo["companyName"]))

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "detectionDate": self.get_date(self.driver),
                        "postSignature": postSignature,
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "killsec",
                    }
                )

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
    killsec_scraper = KillsecScraper(args)
    killsec_scraper.download()
