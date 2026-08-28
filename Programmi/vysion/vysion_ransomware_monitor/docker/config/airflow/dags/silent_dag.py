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
    dag_id='silent',
    default_args=default_args,
    description='Silent crawler DAG',
    schedule_interval=None,
    catchup=False,
    is_paused_upon_creation=False
) as dag:

    task = BashOperator(
        task_id=f"{dag.dag_id}_crawler_task",
        bash_command="cd /opt/vysion_ransomware/ && python3 {{ dag.dag_id }}.py {{ dag_run.conf.get('params') if dag_run and dag_run.conf else '' }}",
        dag=dag
    )