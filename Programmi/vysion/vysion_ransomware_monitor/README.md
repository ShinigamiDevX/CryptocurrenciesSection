# Vysion Ransomware Monitor

## Configuration

Before launching the containers, make sure to create the environment file **.env** under the folder */docker/*. A template file "**.env_template**" is provided, and it should look like this:

```bash
ELASTICSEARCH_HOST="elasticsearch:9200"
ELASTICSEARCH_USER="elastic"
ELASTICSEARCH_PASSWORD="elastic"
KIBANA_USER="kibana_user"
KIBANA_PASSWORD="kibana"
MINIO_HOST="minio:9000"
MINIO_USER="minio"
MINIO_PASSWORD="minio1234"
AIRFLOW_USER="airflow"
AIRFLOW_PASSWORD="airflow"
```

There is an optional variable to enrich the plugins via a Shodan API key:

```bash
SHODAN_API_KEY=""
```

When launching the Elastic database, the script **configElasticKibana.sh** is used to create the correct mapping for the index and an example Kibana dashboard.

## Workflow

The **airflow** container will launch the crawlers located in the */vysion_ransomware/* folder sequentially. For each crawler, there is a dag with a task to launch it, and will insert the results in Elastic and Minio. This command will access the **airflow** container, and it is also possible to launch the crawlers from there:

```bash
docker exec -it vysion-ransomware-airflow-scheduler-1 bash
```

When starting and launching dags in the airflow interface, be aware of stopping those currently running, as it will interfere with the Tor connections.

## Development and testing

To add a new crawler, the script must be located in folder */vysion_ransomware/*. Then, create a dag for that crawler *(same name + "_dag")* under */docker/config/airflow/dags/*.

```bash
vysion_ransomware_monitor
    ├── docker
    │   └── config
    │       └── airflow
    │           └── dags
    │               └── my_crawler_dag.py
    └── vysion_ransomware
        └── my_crawler.py
```

Set the same name as the Python crawler's name.

```python
with DAG(
    dag_id='my_crawler',
    default_args=default_args,
```

To launch the crawlers outside the **monitor** container, make sure your environment variables are set and point to the databases (localhost):

```bash
ELASTICSEARCH_HOST="localhost:9200"
MINIO_HOST="localhost:9000"
```

If not using the **tor** proxy container, make sure to change the webdriver settings on each crawler to use the appropiate proxy address. 

```python
options.add_argument(
    "--proxy-server=socks5://"
    + os.environ.get("TOR_SOCKS_PROXY", "127.0.0.1:9050")
)
```