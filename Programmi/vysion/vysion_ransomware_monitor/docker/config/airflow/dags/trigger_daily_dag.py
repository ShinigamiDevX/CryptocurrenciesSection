import os

from airflow import DAG
from airflow.operators.dagrun_operator import TriggerDagRunOperator
from airflow.sensors.external_task import ExternalTaskSensor
from airflow.utils.dates import days_ago
from airflow.utils.trigger_rule import TriggerRule

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': days_ago(1),
    'retries': 0,
}

dag_list = [i.split('.py')[0] for i in os.listdir('/opt/vysion_ransomware/') if i.endswith('.py')]
dag_list.sort()

# Define the sequence of tasks to trigger individual DAGs
with DAG(
    'sequentially_trigger_daily_dag',
    default_args=default_args,
    description='Sequentially triggers other DAGs in daily mode',
    schedule_interval='@hourly',  # Run every hour
    catchup=False,
    is_paused_upon_creation=False
) as dag:
    
    task_list = []
    prev_sensor_task = None
    for dag_id in dag_list:
        trigger_task = TriggerDagRunOperator(
            task_id=f'trigger_{dag_id}_dag',
            trigger_dag_id=dag_id,
            conf={"params": "--mode daily"},
            wait_for_completion=False,
            execution_date="{{ execution_date }}",
            dag=dag,
            trigger_rule=TriggerRule.ALL_DONE,
        )
        task_list.append(trigger_task)
    
        # ExternalTaskSensor to wait for each tasks completion
        wait_for_task = ExternalTaskSensor(
            task_id=f'wait_for_{dag_id}_dag',
            external_dag_id=dag_id,
            mode="poke",
            timeout=360,
            dag=dag,
            retries=0,
            trigger_rule=TriggerRule.ALL_DONE,
        )

        if prev_sensor_task:
            prev_sensor_task >> trigger_task
            trigger_task >> wait_for_task
        else:
            trigger_task >> wait_for_task

        prev_sensor_task = wait_for_task
    
