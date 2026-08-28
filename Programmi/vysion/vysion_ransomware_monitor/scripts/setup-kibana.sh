#!/bin/bash

printf "Waiting for Elasticsearch to be ready..."
# this curl command must equal to "green" in order to proceed
while true; do
    status=$(curl -s -u ${ELASTICSEARCH_USERNAME}:${ELASTICSEARCH_PASSWORD} -X GET "http://elasticsearch:9200/_cluster/health" |  awk -F'"' '/"status"/ {print $8}')
    if [ "$status" != "red" ]; then
        break
    fi
    printf '.'
    sleep 5
done

printf "Sleeping for 60 seconds for Kibana to be ready..."
sleep 60