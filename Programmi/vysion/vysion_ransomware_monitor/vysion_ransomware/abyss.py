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
Data collection script for Abyss ransomware group. 
Onion Service URL: http://3ev4metjirohtdpshsqlkrqcmxq6zu3d7obrdhglpy5jpbr7whmlfgqd.onion 

name: abyss.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class AbyssScraper:
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
            - info: Additional info.
        """

        name = (
            element
            .find_element(By.CLASS_NAME, "card-title")
            .text
            .strip()
        )

        info = (
            element
            .find_element(By.CLASS_NAME, "card-text")
            .text
            .strip()
        )

        return name, info

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        Abyss does not have a date on the post banner, so it returns the current date.
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Abyss leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://3ev4metjirohtdpshsqlkrqcmxq6zu3d7obrdhglpy5jpbr7whmlfgqd.onion"  ### Abyss URL
        res = 1
        while res == 1:
            try:
                self.driver.get(url)
                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "card-body"))
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

                victimList = [card for card in self.driver.find_elements(By.CLASS_NAME, "card.h-100.text-white.bg-dark ")]
                buttonList = [card.find_element(By.TAG_NAME, "button") for card in victimList]

                victimsInfo = []
                for victim in victimList:
                    result = {}
                    name, info = self.extract_info(victim)
                    result["companyName"] = name
                    result["companyLink"] = "http://" + name
                    result["url"] = url
                    result["group"] = "Abyss"
                    result["network"] = "Tor"
                    result["text"] = info
                    result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                    victimsInfo.append(result)

                    if args.mode == "daily" and len(victimsInfo) > 10:
                        break

                for victimInfo, button in zip(victimsInfo, buttonList):
                    parsed_url = url_model.parse(victimInfo["url"])
                    victimInfo.update(parsed_url.__dict__)
                    victimInfo["port"] = 80

                    self.driver.execute_script("arguments[0].click();", button)
                    WebDriverWait(self.driver, 1200).until(
                        EC.presence_of_element_located((By.CLASS_NAME, "modal-content.bg-dark.text-white"))
                    )

                    html = self.driver.page_source
                    ransomwarePost = (
                        self.driver
                        .find_element(By.CLASS_NAME, "modal-body")
                        .find_element(By.ID, "full-card-text")
                        .get_attribute("innerText")
                    )
                    ransomwarePost += "\n".join(
                        link.get_attribute("href")
                        for link in self.driver
                        .find_element(By.ID, "full-card-links")
                        .find_elements(By.TAG_NAME, "a")
                    )
                    soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                    text = victimInfo["text"] + "\n" + soup.get_text()

                    victimInfo.update(
                        {
                            "pageTitle": self.driver.title,
                            "ransomwarePost": ransomwarePost,
                            "detectionDate": self.get_date(None),
                            "postSignature": hashlib.sha256(
                                (victimInfo["url"] + 
                                victimInfo["companyName"]) # No individual url for each post
                                .encode("utf-8")
                            ).hexdigest(),
                            "html": self.driver.page_source,
                            "text": text,
                            "ransomwareGroup": "abyss",
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
    abyss_scraper = AbyssScraper(args)
    abyss_scraper.download()
