#!/bin/sh
set -e
apk add --no-cache curl jq >/dev/null
echo "Waiting for Elasticsearch..."
i=0
while true; do
  status=$(curl -s -u elastic:elastic -X GET http://elasticsearch:9200/_cluster/health | jq -r .status 2>/dev/null || true)
  if [ "$status" = "green" ] || [ "$status" = "yellow" ]; then
    echo " Elasticsearch $status"
    break
  fi
  i=$((i+1))
  if [ "$i" -gt 90 ]; then
    echo "Elasticsearch not ready after 7+ minutes (status='$status')"
    exit 1
  fi
  printf '.'
  sleep 5
done
tail -n +2 /doc/ransomware.json > /tmp/temp_query.json
curl -sS -XPUT "http://elasticsearch:9200/_index_template/ransomware_template_1" \
  -H "Content-Type: application/json" -d @/tmp/temp_query.json -u elastic:elastic
echo
echo "Waiting for Kibana..."
i=0
while true; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://kibana:5601/api/status || true)
  if [ "$code" = "200" ]; then
    echo " Kibana ready"
    break
  fi
  i=$((i+1))
  if [ "$i" -gt 90 ]; then
    echo "Kibana not ready after 7+ minutes (http $code)"
    exit 1
  fi
  printf '.'
  sleep 5
done
curl -sS -X POST "http://kibana:5601/api/saved_objects/_import?overwrite=true" \
  -H "kbn-xsrf: true" --form file=@/doc/Kibana.ndjson -u elastic:elastic
echo
echo "Elastic/Kibana config done."
