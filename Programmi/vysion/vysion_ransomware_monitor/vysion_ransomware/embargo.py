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
Data collection script for Embargo ransomware group. 
Onion Service URL: http://embargobe3n5okxyzqphpmk3moinoap2snz5k6765mvtkk7hhi544jid.onion 

name: embargo.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class EmbargoScraper:
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

    def expand_victims(self):
        """
        Expands the victims list by clicking the dropdown

        Returns:
            int: Number of default victims shown
        """
        dropdown = WebDriverWait(self.driver, 30).until(
            EC.presence_of_element_located((By.CLASS_NAME, "p-dropdown"))
        )
        self.driver.execute_script("arguments[0].click();", dropdown)

        dropdown_items = WebDriverWait(self.driver, 30).until(
            EC.presence_of_element_located((By.CLASS_NAME, "p-dropdown-items"))
        )
        default_number = int(dropdown_items.find_elements(By.CLASS_NAME, "p-dropdown-item")[0].text.strip())
        self.driver.execute_script("arguments[0].click();", dropdown_items.find_elements(By.CLASS_NAME, "p-dropdown-item")[-1])

        WebDriverWait(self.driver, 30).until(
            EC.presence_of_element_located((By.CLASS_NAME, "col-12"))
        )

        return default_number

    def extract_info(self, element):
        """
        Extracts information from an attribute class.

        Args:
            element: The element to extract information from.

        Returns:
            A tuple containing the extracted information:
            - name: The name extracted from the element.
            - companyLink: The link to the company, or None if not found.
            - detectionDate: Additional info extracted from the element.
        """

        name = (
            element
            .find_element(By.CLASS_NAME, "flex.flex-column")
            .find_element(By.CLASS_NAME, "text-xl")
            .text
            .strip()
        )

        urls = (
            URLExtract()
            .find_urls("http://" + name)
        )
        if urls:
            companyLink = urls[0]
        else:
            companyLink = None

        try:
            date_text = element.find_element(By.CLASS_NAME, "flex.justify-content-between").find_elements(By.TAG_NAME, "div")[0].text.strip()
            detectionDate = datetime.strptime(date_text, "%m/%d/%Y, %I:%M:%S %p").strftime(ScriptsUtils.date_pattern)
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

        return name, companyLink, detectionDate

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Embargo leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://embargobe3n5okxyzqphpmk3moinoap2snz5k6765mvtkk7hhi544jid.onion/"  ### Embargo URL

        try:
            self.driver.get(url)
            default_victims = self.expand_victims()

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

            pageLinksElements = self.driver.find_elements(By.CLASS_NAME, "col-12")
            for i in range(len(pageLinksElements)):
                if args.mode == "daily" and i >= 10:
                    break
                if i < default_victims:
                    WebDriverWait(self.driver, 30).until(
                        EC.presence_of_element_located((By.CLASS_NAME, "col-12"))
                    )
                    pageLinks = self.driver.find_elements(By.CLASS_NAME, "col-12")
                else:
                    self.expand_victims()
                    pageLinks = self.driver.find_elements(By.CLASS_NAME, "col-12")

                p = pageLinks[i]
                victimInfo = {}
                name, company_link, detectionDate = self.extract_info(p)
                victimInfo["companyName"] = name
                if company_link:
                    victimInfo["companyLink"] = company_link
                victimInfo["group"] = "Embargo"
                victimInfo["network"] = "Tor"
                victimInfo["detectionDate"] = detectionDate
                victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

                tries = 0
                while tries < 5:
                    try:
                        p.click()
                        break
                    except Exception as e:
                        time.sleep(10)
                        tries += 1
                
                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "flex.flex-column.gap-3"))
                )

                victimInfo["url"] = self.driver.current_url
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                ransomwarePost = self.driver.find_element(By.CLASS_NAME, "flex.px-4").text
                ransomwarePost += "\n".join([c.text for c in self.driver.find_elements(By.CLASS_NAME, "flex.flex-column")])

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")).hexdigest(),
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "embargo",
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
    daixin_scraper = DaixinScraper(args)
    daixin_scraper.download()
