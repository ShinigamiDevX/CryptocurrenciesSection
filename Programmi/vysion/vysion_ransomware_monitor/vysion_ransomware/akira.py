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
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium_stealth import stealth
from utils.utils import scriptsUtils

"""
Data collection script for Akira ransomware group. 
Onion Service URL: http://akiral2iz6a7qgd3ayp3l6yub7xx2uep76idk3u2kollpj5z3z636bad.onion 

name: akira.py
author: Byron Labs S.L.
"""

ScriptsUtils = scriptsUtils()

class AkiraScraper:
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

    def save_victim(self, victim, url):
        """
        Saves the victim information to the database.

        Args:
            victim: The victim information to save.
        """
        victimInfo = {}
        victimInfo["companyName"] = victim["name"]
        victimInfo["url"] = url
        victimInfo["group"] = "Akira"
        victimInfo["network"] = "Tor"
        victimInfo["ransomwarePost"] = victim["info"]
        victimInfo["text"] = victim["text"]
        victimInfo["detectionDate"] = victim["date"]
        victimInfo["ingestionDate"] = datetime.now(timezone.utc).strftime(ScriptsUtils.date_pattern)

        parsed_url = url_model.parse(victimInfo["url"])
        victimInfo.update(parsed_url.__dict__)
        victimInfo["port"] = 80

        victimInfo.update(
            {
                "pageTitle": self.driver.title,
                "postSignature": hashlib.sha256(
                        (victimInfo["url"] + 
                        victimInfo["companyName"])
                    .encode("utf-8")
                ).hexdigest(),
                "html": self.driver.page_source,
                "ransomwareGroup": "akira",
            }
        )
        sha1sum, sha256sum = ScriptsUtils.get_hashes(victimInfo["html"])

        victimInfo["sha1sum"] = sha1sum
        victimInfo["sha256sum"] = sha256sum

        image = ScriptsUtils.save_screenshot(self.driver)
        self.success |= self.elastic.save_victim(victimInfo, image)

    def extract_info(self, rows, url):
        """
        Processes the victims information, to merge them into a single structure

        Args:
            rows: The news information to process.
        """
        count = 0
        info = company = date = ""
        for i in range(0, len(rows), 2):

            columns = (rows[i+1].find_element(By.TAG_NAME, "span").text + rows[i].find_element(By.TAG_NAME, "span").text).split("|")[1:-1]

            if columns[1].strip() != "": # if there is text in the companie's column
                if(columns[0].strip() != ""): # if date available  
                    # scroll to the element
                    self.driver.execute_script("""
                            const el = arguments[0];
                            const scroller = arguments[1];
                            scroller.scrollTop = el.offsetTop-30;
                        """, rows[i].find_element(By.TAG_NAME, "span"), self.driver.find_element(By.CLASS_NAME, "terminal-scroller"))

                    company = columns[1].strip() + company
                    info = columns[2][1:-1] + info
                    date = columns[0].strip()
                    victimInfo ={
                        "name": company,
                        "info": info,
                        "date": datetime.strptime(date, "%Y-%m-%d").replace(
                            tzinfo=timezone.utc
                        ),
                        "text": f"Company: {company}\nDate: {date}\n\n{info}"
                    }
                    self.save_victim(victimInfo, url)
                    count += 1
                    if args.mode == "daily" and count >= 10:
                        break
                    info = company = date = ""
                else:
                    company = columns[1].strip() + company
                    info = columns[2][1:-1] + info
            else:
                info = columns[2][1:-1].strip() + info

    def send_commnad(self, driver, command, css_selector):
        """
        Sends a command to the terminal-like interface of the Akira site.

        Args:
            command: The command to send.
            css_selector: The CSS selector of the element to wait for.
            div_index: The index of the div to start extracting information from.

        Returns:
            List of the web elements that contain the information.
        """
        if command != "":
            actions = ActionChains(driver)
            actions.send_keys(command + Keys.RETURN)
            actions.perform()
        WebDriverWait(self.driver, 120).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, css_selector))
        )
        time.sleep(5)
        return self.driver.find_element(By.CSS_SELECTOR, ".terminal-output > div:nth-child(8)").find_elements(By.CSS_SELECTOR, "div")[6:-2][::-1]

    def download(self):
        """
        Downloads the information from the Akira leak site.

        Args:
            mode: The mode to download the information in. Can be "full" or "single".
        """
        try:
            self.driver.set_page_load_timeout(60)
            url = "https://akiral2iz6a7qgd3ayp3l6yub7xx2uep76idk3u2kollpj5z3z636bad.onion"  ### Akira URL
            self.driver.get(url)
            WebDriverWait(self.driver, 120).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, ".terminal-output > div:nth-child(5)"))
            )

            if ScriptsUtils.check_seized_page(self.driver):
                print("The page has been seized")
                return

            # Groups work in a terminal-like interface, so we need to send commands to the terminal
            rows = self.send_commnad(self.driver, "news", ".terminal-output > div:nth-child(8)")

            if args.mode == "full":
                print("Getting all pages...")
                last_page = int(self.driver.find_element(By.CLASS_NAME, "pagination").find_elements(By.TAG_NAME, "a")[-1].text.strip())

            elif args.mode == "daily":
                # Take the first 10 victims
                print("Taking the first 10 victims")
                last_page = 1

            print("Extracting and saving information...")
            for page in range(1, last_page + 1):
                print(f"Getting page {page}...")
                if page > 1:
                    self.driver.find_element(By.CLASS_NAME, "pagination").find_elements(By.TAG_NAME, "a")[-2].click()
                    time.sleep(5)
                    WebDriverWait(self.driver, 120).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, ".terminal-output > div:nth-child(5)"))
                    )
                    rows = self.send_commnad(self.driver, "", ".terminal-output > div:nth-child(8)")
                self.extract_info(rows, url)

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
    akira_scraper = AkiraScraper(args)
    akira_scraper.download()
