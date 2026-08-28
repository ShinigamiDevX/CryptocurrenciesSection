#!/bin/bash
QUERY_FILE=../doc/ransomware.json
ENV_FILE=../docker/.env

# Load environment variables
export $(grep -v '^#' $ENV_FILE | xargs)

echo "| Uploading elasticsearch index template |"

printf "Waiting for Elasticsearch to be ready..."
until [ "$(curl -s -u ${ELASTICSEARCH_USER}:${ELASTICSEARCH_PASSWORD} -X GET "http://localhost:9200/_cluster/health" | jq -r .status)" != "red" ]; do
    printf '.'
    sleep 5
done

tail -n +2 "$QUERY_FILE" > ./temp_query.json
curl -XPUT "http://localhost:9200/_index_template/ransomware_template_1"  -H "Content-Type: application/json" -d @temp_query.json -u ${ELASTICSEARCH_USER}:${ELASTICSEARCH_PASSWORD}
rm temp_query.json

DASHBOARD_FILE=../doc/Kibana.ndjson
echo -e "\n| Uploading kibana dashboard |"
printf "Waiting for Kibana to be ready..."
until [ $(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5601/api/status") == 200 ]; do
    printf '.'
    sleep 5
done
curl -X POST "http://localhost:5601/api/saved_objects/_import?overwrite=true" -H "kbn-xsrf: true" --form file=@$DASHBOARD_FILE -u ${ELASTICSEARCH_USER}:${ELASTICSEARCH_PASSWORD}
