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
Data collection script for Rhysida ransomware group. 
Clearnet Service URL: http://rhysidafohrhyy2aszi7bm32tnjat5xri65fopcxkdfxhi4tidsg7cad.onion/ 

name: rhysida.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class RhysidaScraper:
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
            - company_link: The victims company link
        """

        name = (
            element[0]
            .get_attribute("innerHTML")
        )
        
        if "onion" in element[0].get_attribute("href"):
            company_link = element[0].get_attribute("href").split(".onion/")[1]
        else:
            company_link = element[0].get_attribute("href")

        return name, company_link

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.strftime(
                datetime.now(timezone.utc), ScriptsUtils.date_pattern
            )
    
    def get_auctions(self, driver, url):
        """
        Gets the auctions section from the webpage. 
        """
        driver.get(url)
        element = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "companies_online"))
        )
 
        element.click()
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CLASS_NAME, "col-10"))
        )

        return driver

    def get_archive(self, driver, url):
        """
        Gets the archive section from the webpage. 
        """
        driver.get(url)
        element = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "auctions_online"))
        )
    
        element.click()
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CLASS_NAME, "col-10"))
        )
        return driver

    def download(self, pagesLink):
        """
        Downloads the information from the Rhysida leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """

        page_driver = self.driver

        victims = []
        for p in pagesLink:
            result = {}
            name, company_link = self.extract_info(p)
            result["companyName"] = name
            result["companyLink"] = company_link
            result["url"] = self.url            
            result["group"] = "Rhysida"
            result["network"] = "Tor"
            result["ingestionDate"] = result["detectionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
            victims.append(result)

            if args.mode == "daily" and len(victims) >= 10:
                break
        
        for victimInfo, i in zip(victims, [p[1] for p in pagesLink]):
            parsed_url = url_model.parse(victimInfo["url"])
            victimInfo.update(parsed_url.__dict__)
            victimInfo["port"] = 80

            html = page_driver.page_source
            soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
            text = soup.get_text()
            
            if len(i) == 1:
                victimInfo["ransomwarePost"] = i[0].get_attribute("innerText")
            else:
                victimInfo["ransomwarePost"] = i[1].text + "\n".join(p.text for p in i[2].find_elements(By.TAG_NAME, "p"))
                if len(i[2].find_element(By.TAG_NAME, "p").find_elements(By.TAG_NAME, "a")) != 0:
                    victimInfo["ransomwarePost"] += "\nDocuments\n" + i[2].find_element(By.TAG_NAME, "p").find_element(By.TAG_NAME, "a").get_attribute("href")

            victimInfo.update(
                {
                    "pageTitle": page_driver.title,
                    "postSignature": hashlib.sha256(str(victimInfo["url"]+victimInfo["companyName"]).encode("utf-8")
                    ).hexdigest(),
                    "html": page_driver.page_source,
                    "text": text,
                    "ransomwareGroup": "rhysida",
                }
            )
            sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"]+victimInfo["companyName"])

            victimInfo["sha1sum"] = sha1sum
            victimInfo["sha256sum"] = sha256sum

            image = ScriptsUtils.save_screenshot(page_driver)
            self.success |= self.elastic.save_victim(victimInfo, image)

    def main(self):
        try:
            self.driver.set_page_load_timeout(60)
            self.url = "http://rhysidafohrhyy2aszi7bm32tnjat5xri65fopcxkdfxhi4tidsg7cad.onion/"

            if args.mode == "full":
                # Scroll to the bottom of the page
                print("Scrolling to the bottom of the page")
            elif args.mode == "daily":
                # Take the first 10 victims
                print("Taking the first 10 victims")
        
            try:
                self.driver=self.get_auctions(self.driver, self.url)
                auctions = [[e.find_element(By.TAG_NAME, "a"), [e.find_elements(By.CLASS_NAME, "m-2")[1]]] for e in self.driver.find_elements(By.CLASS_NAME, "col-10")]
                self.download(auctions)
            except:
                pass

            self.driver=self.get_archive(self.driver, self.url)
            archive = [[e.find_element(By.TAG_NAME, "a"), e.find_elements(By.CLASS_NAME, "m-2")] for e in self.driver.find_elements(By.CLASS_NAME, "col-10")]
            self.download(archive)

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
    rhysida_scraper = RhysidaScraper(args)
    rhysida_scraper.main()
