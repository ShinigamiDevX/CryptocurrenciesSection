import argparse
import logging as log
import os
import sys
import threading
from datetime import date, datetime, timedelta

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from dbModules.databaseMethods import databaseMethods
from plugin_libraries.detection import country_detect


class country_detection:
    def __init__(self, args):
        self.args = args
        
        elk_methods = databaseMethods()
        self.es = elk_methods.get_elastic_connection()

        if self.args.date == date.today():
            self.args.date = date.today() - timedelta(days=2)

    def process_hit(self, results):
        for hit in results:
            # Do something with the hit
            if hit["_source"]["companyLink"]:
                country, tld = country_detect(hit["_source"]["companyLink"])
                if country:
                    log.debug("Date " + hit["_source"]["detectionDate"])
                    log.debug("Detected country " + country + " and tld " + tld)
                    # Update the document
                    result = self.es.update(
                        index=hit["_index"],
                        id=hit["_id"],
                        doc={"country": country, "tld": tld},
                    )
                    log.debug(result)

    def detect(self):
        exists_query = {
            "bool": {
                "should": [
                    {"bool": {"must": {"exists": {"field": "companyLink"}}}}
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

        results = self.es.search(
            index="ransomware-*",
            source_excludes=["html", "text"],
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

    country_detection = country_detection(args)
    country_detection.detect()
