
import type { PoolTask } from './Task'
import type { PoolInstance } from './Instance'
import type { PoolManager } from './Manager';
import { TimeoutValue } from '../utils';

export type PoolTaskResult<Result = any> = [Error | null, Result | null, PoolInstance | null, PoolTask];

export type IDistributePoolTasksRes = [PoolInstance | undefined, PoolTask | undefined][] | null | undefined;
export type IDistributePoolTasks = (pools: PoolInstance[], tasks: PoolTask[]) => IDistributePoolTasksRes;

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
    taskQueueTimeout: TimeoutValue;
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

export enum PoolTaskState {
    queue = 'queue',
    running = 'running',
    finished = 'finished',
    canceled = 'canceled',
}

export interface PoolTaskOptions {
    pool?: PoolInstance,
    taskQueueTimeout?: TimeoutValue,
    poolAttempts?: number,
    generalAttempts?: number,
}

export type PoolInstanceBaseState = {
    instanceName: string;
    status: PoolInstanceStatus,
    error?: any,
}
export type PoolInstanceDefaultState = PoolInstanceBaseState
export interface PoolInstanceOptions<PoolInstanceState> {
    manager?: PoolManager,
    userState?: Partial<PoolInstanceState>,
}

export interface PoolInstance_InitOptions {
    attempts?: number | undefined,
    onerror?: (pool: PoolInstance, error: Error | any) => void
}

export enum PoolInstanceStatus {
    'initQueue' = 'initQueue',
    'initStarting' = 'initStarting',
    'initFailed' = 'initFailed',
    'free' = 'free',
    'running' = 'running',
    'failed' = 'failed',
}

export interface PoolTaskMini {
    taskContent: any;
}