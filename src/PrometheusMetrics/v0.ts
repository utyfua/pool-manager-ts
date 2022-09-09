import { PoolManager, PoolTask, PoolTaskResult, PoolTaskState } from '../Pool';
import type { Registry } from 'prom-client';

export async function setupPoolManagerPrometheusMetricsV0({
    registry,
    registers,
    poolManager,
    metricPrefix = 'lib_pool_manager_',
    taskStatusLabel = 'status',
    taskLabelNames,
    taskLabelExtractor,
    metrics: {
        instanceStatusName = 'instance_status',
        instanceStatusHelp = 'Which statuses in each of the pool instances',
        queueTasksName = 'queue_tasks',
        queueTasksHelp = 'Number of tasks in queue',
        runningTasksName = 'running_tasks',
        runningTasksHelp = 'Number of tasks in work',
        taskFlowSecondsTotalName = 'task_flow_seconds_total',
        taskFlowSecondsTotalHelp = 'Time spend on task queue and executing',
    } = {}
}: {
    registry?: Registry,
    registers?: Registry[],
    metricPrefix?: string,
    taskStatusLabel?: string,
    taskLabelNames?: string[],
    taskLabelExtractor?: (task: PoolTask) => object,
    taskCustomLabelNames: [],
    poolManager: PoolManager,
    metrics?: {
        instanceStatusName?: string,
        instanceStatusHelp?: string,
        queueTasksName?: string,
        queueTasksHelp?: string,
        runningTasksName?: string,
        runningTasksHelp?: string,
        taskFlowSecondsTotalName?: string,
        taskFlowSecondsTotalHelp?: string,
    },
}) {
    if (taskLabelNames?.includes(taskStatusLabel))
        throw new Error(`Label name ${taskStatusLabel} in taskLabelNames is reserved by package, ` +
            `but you can change using taskStatusLabel to change it`);
    taskLabelNames ??= [];
    taskLabelNames?.push(taskStatusLabel)

    const { Gauge, Histogram, register: defaultRegister } = await import('prom-client');
    if (registry) registers?.push(registry)
    registers ??= registry ? [registry] : [defaultRegister]

    let stateGaugeLabels: Set<string> = new Set([]);
    const instanceStatusGauge = new Gauge({
        name: `${metricPrefix}${instanceStatusName}`,
        help: instanceStatusHelp,
        labelNames: ['state'],
        registers,
        collect() {
            // todo: rework gauge collecting
            const poolStates = Object.fromEntries(
                poolManager.poolList.map((pool) => [
                    pool.poolInstanceName,
                    pool.state,
                ])
            );
            const statusCounted = {};
            Object.values(poolStates).forEach(status =>
                statusCounted[status] = (statusCounted[status] || 0) + 1)

            stateGaugeLabels = new Set([...stateGaugeLabels, ...Object.keys(statusCounted)]);
            stateGaugeLabels.forEach(label => {
                this.labels(label).set(statusCounted[label] || 0)
            })
        },
    });

    const queueTasksGauge = new Gauge({
        name: `${metricPrefix}${queueTasksName}`,
        help: queueTasksHelp,
        registers,
        collect() {
            this.set(poolManager.queueTasks.length);
        },
    })

    const runningTasksGauge = new Gauge({
        name: `${metricPrefix}${runningTasksName}`,
        help: runningTasksHelp,
        registers,
        collect() {
            this.set(poolManager.runningTasks.length);
        },
    })

    const taskFlowSecondsTotalHistogram = new Histogram({
        name: `${metricPrefix}${taskFlowSecondsTotalName}`,
        help: taskFlowSecondsTotalHelp,
        registers,
        labelNames: taskLabelNames,
    });

    poolManager.on('taskInit', (task: PoolTask) => {
        let _end = taskFlowSecondsTotalHistogram.startTimer();
        const end = (status: string) => {
            const labels = taskLabelExtractor && taskLabelExtractor(task) || {};
            labels[taskStatusLabel] = status
            _end(labels)
        }
        let executeListener = () => {
            end('queue');
            _end = taskFlowSecondsTotalHistogram.startTimer();
        }
        task.once('execute', executeListener);
        task.once('result', (result: PoolTaskResult) => {
            task.off('execute', executeListener);
            end(
                task.state === PoolTaskState.canceled ? 'canceled' :
                    result[0] === null ? 'success' : 'failed'
            )
        });
    })

    return {
        instanceStatusGauge,
        queueTasksGauge,
        runningTasksGauge,
        taskFlowSecondsTotalHistogram,
    }
}
