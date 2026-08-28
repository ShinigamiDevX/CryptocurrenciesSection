# Vysion Ransomware API

## Configuration

Before launching the container, make sure to create the environment file **.env** under the folder */docker/*. A template file "**.env_template**" is provided, and it should look like this:

```bash
ELASTICSEARCH_HOST="elasticsearch:9200"
ELASTICSEARCH_USER="elastic"
ELASTICSEARCH_PASSWORD="elastic"
```