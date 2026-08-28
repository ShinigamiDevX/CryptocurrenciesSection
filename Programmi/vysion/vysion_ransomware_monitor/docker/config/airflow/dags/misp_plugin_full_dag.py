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
    dag_id='misp_plugin_full',
    default_args=default_args,
    description='MISP manifest generation DAG',
    schedule_interval="@daily",
    catchup=False,
    is_paused_upon_creation=False
) as dag:

    task = BashOperator(
        task_id=f"{dag.dag_id}_crawler_task",
        bash_command="cd /opt/vysion_ransomware/plugins/ && python3 misp_plugin.py {{ dag_run.conf.get('params') if dag_run and dag_run.conf else '--date 2000-01-01' }}",
        dag=dag
    )

    task
