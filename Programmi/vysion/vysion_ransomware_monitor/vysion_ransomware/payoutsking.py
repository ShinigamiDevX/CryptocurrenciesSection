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
Data collection script for Payoutsking ransomware group. 
Onion Service URL: http://payoutsgn7cy6uliwevdqspncjpfxpmzgirwl2au65la7rfs5x3qnbqd.onion 

name: payoutsking.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class PayoutskingScraper:
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
            date_str = element[0].text.strip()
            return datetime.strptime(date_str, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).strftime(ScriptsUtils.date_pattern)
        except:
            return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Payoutsking leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """        

        self.driver.set_page_load_timeout(60)
        url = "http://payoutsgn7cy6uliwevdqspncjpfxpmzgirwl2au65la7rfs5x3qnbqd.onion/"  ### Payoutsking URL

        try:
            self.driver.get(url)
            element = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.ID, "table"))
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

            pageLinksElements = element.find_elements(By.TAG_NAME, "tr")

            for i, p in enumerate(pageLinksElements):
                if args.mode == "daily" and i >= 10:
                    break
                victimInfo = {}
                tds = p.find_elements(By.TAG_NAME, "td")
                victimInfo["companyName"] = tds[1].text.strip()
                urls = (
                    URLExtract()
                    .find_urls(tds[2].text.strip())
                )
                if urls:
                    victimInfo["companyLink"] = urls[0]
                victimInfo["url"] = url
                victimInfo["group"] = "Payoutsking"
                victimInfo["network"] = "Tor"
                victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
                victimInfo["detectionDate"] = self.get_date(tds)

                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                info_element = tds[1].find_elements(By.TAG_NAME, "a")
                victimInfo["postSignature"] = hashlib.sha1((victimInfo["companyName"]+victimInfo["detectionDate"]).encode()).hexdigest()
                if len(info_element) > 0:
                    self.driver.get(url + info_element[0].get_attribute("hx-post"))
                    
                    info_element = WebDriverWait(self.driver, 30).until(
                        EC.presence_of_element_located((By.ID, "post-container"))
                    )
                    victimInfo["ransomwarePost"] = info_element.text.strip()

                    self.driver.maximize_window()
                    height = self.driver.get_window_size()["height"]
                    image = ScriptsUtils.save_screenshot(self.driver, height=height)
                    self.driver.back()
                else:
                    victimInfo["ransomwarePost"] = " ".join([td.text.strip() for td in tds[2:]])
                    self.driver.maximize_window()
                    height = self.driver.get_window_size()["height"]
                    image = ScriptsUtils.save_screenshot(self.driver, height=height)

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "html": self.driver.page_source,
                        "text": text,
                        "ransomwareGroup": "payoutsking",
                    }
                )
                sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"]+victimInfo["companyName"])

                victimInfo["sha1sum"] = sha1sum
                victimInfo["sha256sum"] = sha256sum
                
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
    payoutsking_scraper = PayoutskingScraper(args)
    payoutsking_scraper.download()
