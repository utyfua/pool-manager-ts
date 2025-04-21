import type { Registry } from 'prom-client';
import { PoolInstance, PoolManager, PoolTask, PoolTaskResult, PoolTaskState } from '../Pool';
import { collectGaugeData } from './v0GaugeUtil';

export async function setupPoolManagerPrometheusMetricsV0({
    registry,
    registers,
    poolManager,
    metricPrefix = 'lib_pool_manager_',
    poolLabelNames = ['state'],
    poolLabelExtractor = (pool) => ({
        state: pool.getStateSync().status,
    }),
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
        taskResultsName = 'task_result_total',
        taskResultsHelp = 'Number of executed tasks',
        taskFlowSecondsTotalName = 'task_flow_seconds_total',
        taskFlowSecondsTotalHelp = 'Time spend on task queue and executing',
    } = {},
    buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
}: {
    registry?: Registry,
    registers?: Registry[],
    metricPrefix?: string,
    poolLabelNames?: string[],
    poolLabelExtractor?: (pool: PoolInstance) => Record<string, string | number>,
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
        taskResultsName?: string,
        taskResultsHelp?: string,
        taskFlowSecondsTotalName?: string,
        taskFlowSecondsTotalHelp?: string,
    },
    buckets?: number[] | undefined
}) {
    if (taskLabelNames?.includes(taskStatusLabel))
        throw new Error(`Label name ${taskStatusLabel} in taskLabelNames is reserved by package, ` +
            `but you can change using taskStatusLabel to change it`);
    taskLabelNames ??= [];
    taskLabelNames?.push(taskStatusLabel)

    const { Counter, Gauge, Histogram, register: defaultRegister } = await import('prom-client');
    if (registry) registers?.push(registry)
    registers ??= registry ? [registry] : [defaultRegister]

    const instanceStatusGauge = new Gauge({
        name: `${metricPrefix}${instanceStatusName}`,
        help: instanceStatusHelp,
        labelNames: poolLabelNames,
        registers,
        collect() {
            collectGaugeData(this, poolLabelNames, poolManager.poolList, poolLabelExtractor);
        },
    });

    const queueTasksGauge = new Gauge({
        name: `${metricPrefix}${queueTasksName}`,
        help: queueTasksHelp,
        labelNames: taskLabelNames,
        registers,
        collect() {
            collectGaugeData(this, taskLabelNames, poolManager.queueTasks, (task) => {
                const labels = taskLabelExtractor?.(task) || {};
                labels[taskStatusLabel] = task.state
                return labels
            })
        },
    })

    const runningTasksGauge = new Gauge({
        name: `${metricPrefix}${runningTasksName}`,
        help: runningTasksHelp,
        labelNames: taskLabelNames,
        registers,
        collect() {
            collectGaugeData(this, taskLabelNames, poolManager.runningTasks, (task) => {
                const labels = taskLabelExtractor?.(task) || {};
                labels[taskStatusLabel] = task.state
                return labels
            })
        },
    })

    const taskResultsCounter = new Counter({
        name: `${metricPrefix}${taskResultsName}`,
        help: taskResultsHelp,
        registers,
        labelNames: taskLabelNames,
    });

    const taskFlowSecondsTotalHistogram = new Histogram({
        name: `${metricPrefix}${taskFlowSecondsTotalName}`,
        help: taskFlowSecondsTotalHelp,
        registers,
        labelNames: taskLabelNames,
        buckets,
    });

    poolManager.on('taskInit', (task: PoolTask) => {
        let _end = taskFlowSecondsTotalHistogram.startTimer();
        const end = (status: 'queue' | 'canceled' | 'success' | 'failed') => {
            const labels = taskLabelExtractor?.(task) || {};
            labels[taskStatusLabel] = status
            _end(labels)
            if (status !== 'queue')
                taskResultsCounter.inc(labels);
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
        taskResultsCounter,
        taskFlowSecondsTotalHistogram,
    }
}
