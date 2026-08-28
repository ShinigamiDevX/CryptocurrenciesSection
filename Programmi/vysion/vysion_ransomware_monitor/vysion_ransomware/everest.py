import argparse
import hashlib
import os
import time
from datetime import datetime, timezone

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium_stealth import stealth

from dbModules.databaseMethods import databaseMethods
from models.url import url as url_model
from urlextract import URLExtract
from utils.utils import scriptsUtils

"""
Data collection script for Everest ransomware group. 
Onion Service URL: http://ransomocmou6mnbquqz44ewosbkjk3o5qjsl3orawojexfook2j7esad.onion

name: everest.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class EverestScraper:
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

    def get_date(self, element):
        """
        Retrieves the date from the post banner element on a webpage. 
        Everest does not have a date on the post banner, so it returns the current date.
        """
        try:
            date_text = element[0].find_element(By.CLASS_NAME, "mt-3.date-view").text
            detectionDate = datetime.strptime(date_text, "%d %b %Y").replace(tzinfo=timezone.utc).strftime(ScriptsUtils.date_pattern)
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

        return detectionDate

    def download(self, pagesLinks, names):
        """
        Downloads the information from the Everest leak site.

        Args:
            pagesLinks: A list of URLs to the victim pages.
        """

        for p, n in zip(pagesLinks, names):
            if n.strip() == "":
                continue 
            victimInfo = {}
            victimInfo["url"] = p
            victimInfo["group"] = "Everest"
            victimInfo["network"] = "Tor"
            victimInfo["companyName"] = n.strip()
            victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

            try:
                self.driver.get(victimInfo["url"])
                parsed_url = url_model.parse(victimInfo["url"])
                victimInfo.update(parsed_url.__dict__)
                victimInfo["port"] = 80
                
                WebDriverWait(self.driver, 30).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "comment"))
                )
                time.sleep(5)

                html = self.driver.page_source
                soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
                text = soup.get_text()

                comments = self.driver.find_elements(By.CLASS_NAME, "comment")
                company_link = comments[0].find_element(By.CLASS_NAME, "publication-description").text + " " + victimInfo["companyName"]
                urls = URLExtract().find_urls(company_link)
                if urls:
                    victimInfo["companyLink"] = urls[0]
    
                ransomwarePost = ""
                for c in comments:
                    ransomwarePost += c.find_element(By.TAG_NAME, "h3").text + "\n"
                    ransomwarePost += c.find_element(By.CLASS_NAME, "publication-description").text + "\n\n"

                victimInfo.update(
                    {
                        "pageTitle": self.driver.title,
                        "ransomwarePost": ransomwarePost,
                        "detectionDate": self.get_date(comments),
                        "postSignature": hashlib.sha256(
                            victimInfo["url"].encode("utf-8")
                        ).hexdigest(),
                        "html": html,
                        "text": text,
                        "ransomwareGroup": "everest",
                    }
                )

                sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"])

                victimInfo["sha1sum"] = sha1sum
                victimInfo["sha256sum"] = sha256sum

                image = ScriptsUtils.save_screenshot(self.driver)
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
            url = "http://ransomocmou6mnbquqz44ewosbkjk3o5qjsl3orawojexfook2j7esad.onion/"
            self.driver.get(url)
            
            chats = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CLASS_NAME, "w-29.chats-list"))
            )

            if ScriptsUtils.check_seized_page(self.driver):
                    print("The page has been seized")
                    return

            if self.args.mode == "daily":
                print("Taking the first 10 victims")

            elif self.args.mode == "full":
                print("Taking all victims")

            open_chats = chats.find_elements(By.CLASS_NAME, "category-item.js-open-chat")
            pagesLinks = []
            names = []
            for chat in open_chats:
                if "protected" not in chat.get_attribute("data-translit").lower():
                    pagesLinks.append(url + "news/" + chat.get_attribute("data-translit") + "/")
                    names.append(chat.find_element(By.CLASS_NAME, "category-title").text.strip())
                
                if args.mode == "daily" and len(pagesLinks) >= 10:
                    break

            self.download(pagesLinks, names)
    
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
    everest_scraper = EverestScraper(args)
    everest_scraper.main()