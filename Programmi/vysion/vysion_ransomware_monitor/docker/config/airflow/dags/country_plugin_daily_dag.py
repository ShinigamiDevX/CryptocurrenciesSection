from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.utils.dates import days_ago

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': days_ago(1),
    'retries': 0,
}

with DAG(
    dag_id='country_detection_plugin_daily',
    default_args=default_args,
    description='Country Detection Plugin DAG daily',
    schedule_interval='*/5 * * * *',  # Run every 5 min
    catchup=False,
    is_paused_upon_creation=False
) as dag:

    task = BashOperator(
        task_id=f"{dag.dag_id}_crawler_task",
        bash_command="cd /opt/vysion_ransomware/plugins/ && python3 country_detection_plugin.py {{ dag_run.conf.get('params') if dag_run and dag_run.conf else '' }}",
        dag=dag
    )

    task