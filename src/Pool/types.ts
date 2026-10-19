
import type EventEmitter from 'events';
import { TimeoutType } from 'ipc-bus-promise';
import type { PoolTask } from './Task'
import type { PoolInstance } from './Instance'
import type { PoolManager } from './Manager';

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
    maxPoolInitSize: number;
    poolInitAttempts: number;
    poolInitOnError: (error: Error | unknown, pool: PoolInstance) => void;
    distributeTasks: IDistributePoolTasks;
    taskQueueTimeout: TimeoutType;
    taskGeneralExecuteAttempts: number;
    taskPoolExecuteAttempts: number;
}

export const DefaultPoolManagerOptions: PoolManagerOptions = {
    distributeTasks: defaultDistributeTasks,
    maxPoolInitSize: Infinity,
    poolInitQueueSize: 1,
    poolInitAttempts: 1,
    poolInitOnError: (error, pool) => console.error(error),
    taskQueueTimeout: null,
    taskGeneralExecuteAttempts: 1,
    taskPoolExecuteAttempts: 1,
};

export interface BaseTaskManager extends EventEmitter {
    queueTasks: PoolTask[];
    runningTasks: PoolTask[];
    distributeQueuedTasks(): void
    freePools?: PoolInstance[];
}

export interface PoolManagerEventMap {
    poolStatusChange: [pool: PoolInstance, status: PoolInstanceStatus];
    freePool: [pool: PoolInstance];
    taskInit: [task: PoolTask];
    taskResult: [task: PoolTask, result: PoolTaskResult];
    taskExecute: [task: PoolTask, pool: PoolInstance];
}

export enum PoolTaskState {
    queue = 'queue',
    running = 'running',
    finished = 'finished',
    canceled = 'canceled',
}

export interface PoolTaskOptions {
    pool?: PoolInstance,
    isPoolSpecified?: boolean,
    taskQueueTimeout?: TimeoutType,
    poolAttempts?: number,
    generalAttempts?: number,
}

export interface PoolTaskEventMap<Result> {
    execute: [task: PoolTask<Result>, pool: PoolInstance];
    result: [result: PoolTaskResult<Result>];
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

export enum PoolInstanceStatus {
    initQueue = 'initQueue',
    initStarting = 'initStarting',
    initFailed = 'initFailed',
    free = 'free',
    running = 'running',
    failed = 'failed',
    killed = 'killed',
    closed = 'closed',
}

export interface PoolInstanceEventMap {
    status: [status: PoolInstanceStatus];
    free: [];
    result: [result: PoolTaskResult];
}

export interface PoolTaskMini {
    taskContent: any;
}
