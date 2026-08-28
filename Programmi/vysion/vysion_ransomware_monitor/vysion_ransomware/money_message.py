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
Data collection script for Money Message ransomware group. 
Onion Service URL: http://blogvl7tjyjvsfthobttze52w36wwiz34hrfcmorgvdzb6hikucb7aqd.onion/ 

name: money_message.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class MoneyMessageScraper:
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
            - detectionDate: The date extracted from the element, or None if not found.
            - post_link: The link information extracted from the post, or None if not found.
        """

        name = (
            element
            .find_element(By.CLASS_NAME, "MuiBox-root.css-0")
            .text 
        )
        try:
            detectionDate_text = (
                element
                .find_elements(By.CLASS_NAME, "MuiBox-root.css-0")[-1]
                .find_element(By.TAG_NAME, "p")
                .text
                .split("CREATE:")[-1]
                .strip()
            )
            if "-" in detectionDate_text:
                format_date = "%d-%m-%Y"
            else:
                format_date = "%Y.%m.%d"
            detectionDate = (
                datetime.strptime(detectionDate_text, format_date)
                .replace(tzinfo=timezone.utc)
                .strftime(ScriptsUtils.date_pattern)
            )
        except:
            detectionDate = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
        post_link = element.get_attribute("href")

        return name, detectionDate, post_link

    def get_date(self, driver):
        """
        Retrieves the date from the post banner element on a webpage. 
        """
        return datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

    def download(self):
        """
        Downloads the information from the Money Message leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """
        page_driver = self.driver
        pagesLink = page_driver.find_elements(By.TAG_NAME, "a")
        victims = []
        for p in pagesLink:
            result = {}
            name, detectionDate, post_link = self.extract_info(p)
            result["detectionDate"] = detectionDate
            result["companyName"] = name
            result["url"] = post_link
            result["group"] = "Money Message"
            result["network"] = "Tor"
            result["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)
            victims.append(result)

            if args.mode == "daily" and len(victims) >= 10:
                break
        
        for victimInfo in victims:
            page_driver.get(victimInfo["url"])
            parsed_url = url_model.parse(victimInfo["url"])
            victimInfo.update(parsed_url.__dict__)
            victimInfo["port"] = 80

            WebDriverWait(page_driver, 30).until(
                EC.presence_of_element_located((By.TAG_NAME, "p"))
            )

            html = page_driver.page_source
            soup = BeautifulSoup(html.replace("\n", ""), "html.parser")
            text = soup.get_text()

            ransomwarePost = ""
            for box in page_driver.find_elements(By.CLASS_NAME, "MuiBox-root.css-4h4iek"):
                ransomwarePost += box.text + "\n"
                if "Website" in box.text:
                    urls = URLExtract().find_urls(box.text.split("Website")[1].split("\n")[0].strip().replace(":", "").strip())
                    if urls:
                        victimInfo["companyLink"] = urls[0]

            victimInfo.update(
                {
                    "pageTitle": page_driver.title,
                    "ransomwarePost": ransomwarePost,
                    "postSignature": hashlib.sha256(victimInfo["url"].encode("utf-8")
                    ).hexdigest(),
                    "html": page_driver.page_source,
                    "text": text,
                    "ransomwareGroup": "money message",
                }
            )
            sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"])

            victimInfo["sha1sum"] = sha1sum
            victimInfo["sha256sum"] = sha256sum

            image = ScriptsUtils.save_screenshot(page_driver)
            self.success |= self.elastic.save_victim(victimInfo, image)

    def main(self):
        try:
            self.driver.set_page_load_timeout(60)
            self.driver.get(url)

            WebDriverWait(self.driver, 120).until(
                EC.presence_of_element_located((By.CLASS_NAME, "MuiPagination-ul.css-nhb8h9"))
            )
           
            if self.args.mode == "daily":
                num = range(1)
                print("Taking the first page")
            elif self.args.mode == "full":
                num = range(int(self.driver.find_element(By.CLASS_NAME, "MuiPagination-ul.css-nhb8h9").find_elements(By.TAG_NAME, "li")[-2].text))
                print(f"Taking all {num} pages")

            for page_id in num:
                url = (
                    "http://blogvl7tjyjvsfthobttze52w36wwiz34hrfcmorgvdzb6hikucb7aqd.onion/news.php?page="
                    + str(page_id+1)
                )
                print("Downloading " + url)
                self.driver.get(url)
                WebDriverWait(self.driver, 120).until(
                    EC.presence_of_element_located((By.CLASS_NAME, "MuiBox-root.css-16lsen3"))
                )
                if ScriptsUtils.check_seized_page(self.driver):
                    print("The page has been seized")
                    return
                self.download()
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
    money_message_scraper = MoneyMessageScraper(args)
    money_message_scraper.main()
