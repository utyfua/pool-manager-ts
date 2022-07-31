
import type { PoolTask } from './Task'

export enum PoolInstanceState {
    'initQueue' = 'initQueue',
    'initStarting' = 'initStarting',
    'initFailed' = 'initFailed',
    'free' = 'free',
    'running' = 'running'
}

export enum PoolTaskState {
    queue = 'queue',
    running = 'running',
    finished = 'finished',
    canceled = 'canceled',
}

export interface PoolStatus {
    state: PoolInstanceState;
    error?: any;
}

export interface PoolInstance {
    init?: () => Promise<void>;
    executeTask: (data: any) => Promise<any>;
    poolStatus: PoolStatus;
}

export type PoolTaskResult<Result = any> = [Error | null, Result | null, PoolInstance, PoolTask];

export type IDistributePoolTasksRes = [PoolInstance | undefined, PoolTask | undefined][] | null | undefined;
export type IDistributePoolTasks = (pools: PoolInstance[], tasks: PoolTask[]) => IDistributePoolTasksRes;

export type PoolTaskQueueTimeout = number | null;

export const defaultDistributeTasks: IDistributePoolTasks = (pools: PoolInstance[], tasks: PoolTask[]): IDistributePoolTasksRes => {
    const personalPairs: [PoolInstance, PoolTask][] = tasks
        .filter(task => task.pool && pools.includes(task.pool))
        .map(task => [task.pool as PoolInstance, task]);
    if (personalPairs.length)
        return personalPairs;
    return pools.map((pool, i) => [pool, tasks[i]]);
};

export interface PoolManagerOptions {
    poolInitQueueSize: number;
    poolInitAttempts: number;
    distributeTasks: IDistributePoolTasks;
    taskQueueTimeout: PoolTaskQueueTimeout;
    taskGeneralExecuteAttempts: number;
    taskPoolExecuteAttempts: number;
}

export const DefaultPoolManagerOptions: PoolManagerOptions = {
    distributeTasks: defaultDistributeTasks,
    poolInitQueueSize: 1,
    poolInitAttempts: 1,
    taskQueueTimeout: null,
    taskGeneralExecuteAttempts: 1,
    taskPoolExecuteAttempts: 1,
};

export interface PoolTaskOptions {
    pool?: PoolInstance,
    taskQueueTimeout?: PoolTaskQueueTimeout,
    poolAttempts?: number,
    generalAttempts?: number,
}
