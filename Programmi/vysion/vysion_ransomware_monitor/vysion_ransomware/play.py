import argparse
import hashlib
import os
import time
from datetime import datetime, timezone

from bs4 import BeautifulSoup
from dbModules.databaseMethods import databaseMethods
from models.url import url as url_model
import pycountry
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
Data collection script for Play ransomware group. 
Onion Service URL: http://k7kg3jqxang3wh7hnmaiokchk7qoebupfgoik6rha6mjpzwupwtj25yd.onion

name: play.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class PlayScraper:
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

    def get_date(self, content):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self, url, pagesLinks):
        """
        Downloads the information from the Play leak site.

        Args:
            pagesLinks: A list of URLs to the victim pages.
        """
        page_driver = self.driver
        victims = []
        for p in pagesLinks:
            result = {}
            data = p.text.split("\n")

            result["companyName"] = data[0].strip() # ETL if country exists

            country = data[1].split(',')
            if len(country) > 2:
                country = country[2].strip()
            elif len(country) > 1:
                country = country[1].strip()
            else:
                country = country[0].strip()

            result["country"] = pycountry.countries.search_fuzzy(country)[0].alpha_2

            try:
                date = data[4].replace("added:", "").strip()
                result["detectionDate"] = datetime.strptime(date, "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                ).strftime(ScriptsUtils.date_pattern)
            except:
                result["detectionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

            urls = URLExtract().find_urls(data[2].strip())
            if urls:
                victimInfo["companyLink"] = urls[0]

            onclick = p.get_attribute("onclick").replace("viewtopic('", "").replace("')", "")
            result["url"] = url + "topic.php?id=" + onclick

            result["group"] = "Play"
            result["network"] = "Tor"
            result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
            
            victims.append(result)

            if args.mode == "daily" and len(victims) >= 10:
                    break

        for victimInfo in victims:
            try:
                page_driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80
                
                WebDriverWait(page_driver, 30).until(
                    EC.presence_of_element_located((By.TAG_NAME, "tbody"))
                )

                html = page_driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()
                ransomwarePost = page_driver.ffind_elements(By.TAG_NAME, "tbody")[0].text

                victimInfo.update(
                    {
                        "pageTitle": page_driver.title,
                        "ransomwarePost": ransomwarePost,
                        "postSignature": hashlib.sha256(
                            victimInfo["url"].encode("utf-8")
                        ).hexdigest(),
                        "html": html,
                        "text": text,
                        "ransomwareGroup": "play",
                    }
                )

                sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"])

                victimInfo["sha1sum"] = sha1sum
                victimInfo["sha256sum"] = sha256sum

                image = ScriptsUtils.save_screenshot(page_driver)
                self.success |= self.elastic.save_victim(victimInfo, image)

            except Exception as e:
                print(ScriptsUtils.manage_exception(e))

    def main(self):
        """
        Main function that performs navigation and data collection into the leak datasite,
        all pages into full mode and the first one into daily mode.

        """
        try:
            self.driver.set_page_load_timeout(60)
            url = "http://k7kg3jqxang3wh7hnmaiokchk7qoebupfgoik6rha6mjpzwupwtj25yd.onion/"
            
            if ScriptsUtils.check_seized_page(self.driver):
                    print("The page has been seized")
                    return

            if self.args.mode == "daily":
                print("Taking the first 10 victims")
                n = 1
            elif self.args.mode == "full":
                print("Scrolling all pages")
                n = int(
                    self.driver.find_element(By.TAG_NAME, "tbody")
                    .find_elements(By.TAG_NAME, "tr")[-1]
                    .find_elements(By.CLASS_NAME, "Page")[
                        -1
                    ].text
                )

            for p in range(1, n+1):
                try_page = str(p)
                print("Downloading " + try_page)
                self.driver.get(url + "index.php?page=" + try_page)
                time.sleep(5)
                self.driver.refresh()
                WebDriverWait(self.driver, 60).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "News"))
                )
                self.download(url, self.driver.find_elements(By.CLASS_NAME, "News"))
    
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
    play_scraper = PlayScraper(args)
    play_scraper.main()