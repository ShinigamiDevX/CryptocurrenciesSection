import argparse
import logging as log
import os
import sys
import threading
from datetime import date, datetime, timedelta

from bs4 import BeautifulSoup
from langdetect import detect

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from dbModules.databaseMethods import databaseMethods


class lang_detection:
    def __init__(self, args):
        self.args = args
        elk_methods = databaseMethods()
        self.es = elk_methods.get_elastic_connection()

        if self.args.date is None:
            self.args.date = date.today() - timedelta(days=2)

    def process_hit(self, results):
        for hit in results:
            # Do something with the hit
            if hit["_source"]["html"]:
                soup = BeautifulSoup(hit["_source"]["html"], 'html.parser')
                text = soup.get_text()

                # Detect the language
                lang = detect(text)
                log.debug(lang)

                if lang:
                    log.debug("Detected  language: %s", lang)
                    # Update the document
                    result = self.es.update(
                        index=hit["_index"],
                        id=hit["_id"],
                        doc={"language": lang},
                    )
                    log.debug(result)

    def detect(self):
        exists_query = {
            "bool": {
                "must": [
                    {"exists": {"field": "html"}}
                    # {"bool": {"should": [{"term": {"language": ""}}, {"exists": {"field": "language"}}]}} # Only if the field already exists
                ]
            }
        }

        # Define the date filter
        date_filter = {
            "range": {
                "detectionDate": {
                    "gte": self.args.date.strftime("%Y-%m-%d"),
                }
            }
        }

        search_query = {
            "bool": {"must": [{"match_all": {}}, exists_query], "filter": [date_filter]}
        }

        if args.network:
            network_filter = {
                "term": {
                    "network": args.network
                }
            }
            search_query["bool"]["filter"].append(network_filter)

        results = self.es.search(
            index="ransomware-*",
            query=search_query,
            size=10,
            scroll="1m",
            sort="detectionDate:asc",
        )

        threads = []
        while True:
            thread = threading.Thread(
                target=self.process_hit, args=(results["hits"]["hits"],)
            )
            threads.append(thread)
            thread.start()

            if len(results["hits"]["hits"]) < 10:
                break

            # Use the scroll API to retrieve the next batch of hits
            results = self.es.scroll(scroll_id=results["_scroll_id"], scroll="1m")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--date",
        dest="date",
        type=lambda d: datetime.strptime(d, "%Y-%m-%d").date(),
        help="Date to filter forlders (e.g. 2023-01-18)",
        default=date.today(),
    )

    parser.add_argument(
        "--debug",
        dest="debug",
        action="store_true",
        help="Enable debug mode",
    )

    parser.add_argument(
        "--network",
        dest="network",
        type=str,
        help="Network to filter by",
    )

    args = parser.parse_args()

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f'../logs/logfile_{timestamp}.log'

    if args.debug:
        log_level = log.DEBUG
    else:
        log_level = log.ERROR

    log.basicConfig(
        filename=filename,
        level=log_level,
        format='%(asctime)s %(levelname)s %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        style='%'
    )

    if log_level == log.DEBUG:
        console = log.StreamHandler()
        console.setLevel(log_level)
        log.getLogger('').addHandler(console)

    lang_detection = lang_detection(args)
    lang_detection.detect()
