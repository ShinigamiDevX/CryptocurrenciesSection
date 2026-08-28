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
Data collection script for Dragon Force ransomware group. 
Onion Service URL: http://z3wqggtxft7id3ibr7srivv5gjof5fwg76slewnzwwakjuf3nlhukdid.onion 

name: dragon_force.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class DragonForceScraper:
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

    def get_date(self, element):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        try:
            date_text = element.find_element(By.CLASS_NAME, "content-footer__date").text
            detectionDate = datetime.strptime(date_text, "%d %B %Y").strftime(ScriptsUtils.date_pattern)
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        return detectionDate

    def download(self):
        """
        Downloads the information from the Dragon Force leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://z3wqggtxft7id3ibr7srivv5gjof5fwg76slewnzwwakjuf3nlhukdid.onion/"  ### Dragon Force URL

        try:
            self.driver.get(url)
            element = WebDriverWait(self.driver, 300).until(
                EC.presence_of_element_located((By.CLASS_NAME, "publications-list"))
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

            buttons = [
                v.find_element(By.CLASS_NAME, "list-publication__footer")
                .find_element(By.TAG_NAME, "button")
                for v in element.find_elements(By.CLASS_NAME, "publications-list__publication")
            ]

            for i in range(len(buttons)):
                if args.mode == "daily" and i >= 10:
                    break
                victimInfo = {}
                b = (
                    element
                        .find_elements(By.CLASS_NAME, "publications-list__publication")[i]
                        .find_element(By.CLASS_NAME, "list-publication__footer")
                        .find_element(By.TAG_NAME, "button")
                )
                b.click()
                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "publication"))
                )
                time.sleep(10)

                victimInfo["url"] = url
                victimInfo["group"] = "Dragon Force"
                victimInfo["network"] = "Tor"
                victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                content = self.driver.find_element(By.CLASS_NAME, "publication-content")
                victimInfo["companyName"] = content.find_element(By.CLASS_NAME, "publication-content__name").text
                urls = (
                    URLExtract()
                    .find_urls(self.driver.find_element(By.CLASS_NAME, "content-addictional__row").find_element(By.TAG_NAME, "a").get_attribute("href"))
                )
                if urls:
                    victimInfo["companyLink"] = urls[0]
        
                additional = "\n".join(add.text for add in content.find_elements(By.CLASS_NAME, "content-addictional__row"))
                description = "\n" + content.find_element(By.CLASS_NAME, "publication-content__description").find_element(By.TAG_NAME, "p").text
                victimInfo["ransomwarePost"] = additional + description

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "detectionDate": self.get_date(content),
                        "postSignature": hashlib.sha256(
                            str(victimInfo["url"]+victimInfo["companyName"])
                            .encode("utf-8")).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "dragon force",
                    }
                )
                sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"]+victimInfo["companyName"])

                victimInfo["sha1sum"] = sha1sum
                victimInfo["sha256sum"] = sha256sum
                
                image = ScriptsUtils.save_screenshot(self.driver)
                self.success |= self.elastic.save_victim(victimInfo, image)

                self.driver.get(url)

                element = WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "publications-list"))
                )
                time.sleep(10)

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
    dragon_force_scraper = DragonForceScraper(args)
    dragon_force_scraper.download()
