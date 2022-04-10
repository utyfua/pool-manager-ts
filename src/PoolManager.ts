import EventEmitter from 'events'

import { parallelPromiseArrayLoop } from './parallelPromiseArrayLoop'
import { retryUponError } from './retryUponError'

export enum PoolState {
    'initQueue' = 'initQueue',
    'initStarting' = 'initStarting',
    'initFailed' = 'initFailed',
    'free' = 'free',
    'running' = 'running',
}

export interface PoolStatus {
    state: PoolState,
    error?: any,
}

export interface Pool {
    init?: () => Promise<void>;
    executeTask: (data: any) => Promise<any>,
    poolStatus: PoolStatus
}

export interface Task {
    pool?: Pool,
    attempts?: number
    options: any
    result?: [Error | unknown | null, unknown | null]
    _callback: Function;
    promise: Promise<any>
    _queueTimer?: NodeJS.Timeout
}

export type IDistributeTasksRes = [Pool | undefined, Task | undefined][] | null | undefined;
export type IDistributeTasks = (pools: Pool[], tasks: Task[]) => IDistributeTasksRes;

export interface Options {
    pools?: Pool[],
    poolInitQueueSize: number,
    distributeTasks?: IDistributeTasks,
    distributePersonalTasks?: IDistributeTasks,
    // taskAttempts?: number,
    taskQueueTimeout?: number,
}

export const defaultDistributePersonalTasks: IDistributeTasks =
    (pools: Pool[], tasks: Task[]): IDistributeTasksRes => {
        const pairs: [Pool, Task][] = tasks
            .filter(task => task.pool && pools.includes(task.pool))
            .map(task => [task.pool as Pool, task]);
        if (!pairs.length) return null;
        return pairs;
    }

export const defaultDistributeTasks: IDistributeTasks =
    (pools: Pool[], tasks: Task[]): IDistributeTasksRes => pools
        .map((pool, i) => [pool, tasks[i]]);

export class PoolManager extends EventEmitter {
    queueTasks: Task[] = [];
    runningTasks: Task[] = [];
    poolList: Pool[] = [];
    freePools: Pool[] = [];
    distributeTasks: IDistributeTasks;
    distributePersonalTasks: IDistributeTasks;

    constructor(protected options: Options) {
        super();
        this.distributeTasks = this.options.distributeTasks || defaultDistributeTasks
        this.distributePersonalTasks = this.options.distributePersonalTasks || defaultDistributePersonalTasks
        this.options.pools?.map(pool => this.addFreePool(pool))
    }

    async init({ pools, attempts, onerror }: { pools: Pool[], attempts: number | undefined, onerror?: (pool: Pool, error: Error | any) => void }) {

        pools.forEach(pool => {
            pool.poolStatus = {
                state: PoolState.initQueue,
            };
            if (!this.poolList.includes(pool))
                this.poolList.push(pool);
        });

        await parallelPromiseArrayLoop<Pool>({
            iterateArray: pools,
            statement: async (pool: Pool): Promise<void> => {
                try {
                    if (pool.init) {
                        pool.poolStatus = {
                            state: PoolState.initStarting
                        };
                        await retryUponError({
                            func: () => pool.init && pool.init(),
                            attempts
                        });
                    }
                    this.addFreePool(pool);
                } catch (error) {
                    onerror && onerror(pool, error)
                    pool.poolStatus = {
                        state: PoolState.initFailed,
                        error,
                    };
                }
            },
            maxThreads: this.options.poolInitQueueSize,
        })
        if (!this.freePools.length && !this.runningTasks.length)
            throw new Error('No pools are available')
        return this;
    }

    addFreePool(pool: Pool) {
        pool.poolStatus = {
            state: PoolState.free
        };

        if (!this.freePools.includes(pool))
            this.freePools.push(pool);

        this.distributeQueuedTasks();

        if (!this.freePools.includes(pool)) {
            this.emit('freePool', pool)
            return
        }
    }

    /**
     * 
     * @internal
     */
    distributeQueuedTasks() {
        for (; ;) {
            if (!this.freePools.length || !this.queueTasks.length) break;

            const directions = this.getDirectionsForTaskDistributing();

            if (!directions?.length) break

            let countEmptyTasks = 0;

            for (let [pool, task] of directions) {
                if (!pool || !task) {
                    countEmptyTasks++
                    continue
                };

                this.executeTask(pool, task)
            }

            if (countEmptyTasks === directions.length) break;
        }
    }

    /**
     * 
     * @internal
     */
    getDirectionsForTaskDistributing(): IDistributeTasksRes {
        const personalDirections = this.distributePersonalTasks(this.freePools, this.queueTasks.filter(task => task.pool));
        if (personalDirections?.length) return personalDirections;

        const defaultDirections = this.distributeTasks(this.freePools, this.queueTasks.filter(task => !task.pool));
        if (defaultDirections?.length) return defaultDirections;
    }

    proceedRawTask(rawTask: any, { pool }: { pool?: Pool } = {}): Task {
        let _callback;

        const promise = new Promise((resolve) => _callback = resolve)

        const task: Task = {
            pool,
            options: rawTask,
            promise,
            _callback: _callback as unknown as Function,
            _queueTimer: this.options.taskQueueTimeout ?
                setTimeout(() => this.cancelTask(task), this.options.taskQueueTimeout) :
                undefined
        }

        this.queueTasks.push(task)

        this.distributeQueuedTasks()

        return task
    }

    /**
     * 
     * @internal
     */
    executeTask(pool: Pool, task: Task): void {
        const poolIndex = this.freePools.indexOf(pool)
        if (poolIndex !== -1) this.freePools.splice(poolIndex, 1);
        pool.poolStatus = {
            state: PoolState.running
        };

        if (task._queueTimer) clearTimeout(task._queueTimer)

        this.removeTask(task);
        this.runningTasks.push(task);

        this.emit('startedTask', task, pool);

        retryUponError({
            func: () => {
                return pool.executeTask(task.options);
            },
            attempts: task.attempts,
        })
            .then(response => [null, response, pool])
            .catch(err => [err, null, pool])
            .then(result => this.resolveTask(pool, task, result as Task["result"]))
    }

    /**
     * 
     * @internal
     */
    resolveTask(pool: Pool, task: Task, result: Task["result"]): void {
        this.removeTask(task, true)
        task.result = result;
        task._callback(result);
        this.addFreePool(pool);
    }

    /**
     * 
     * @internal
     */
    removeTask(task: Task, isRunning?: boolean) {
        const target = isRunning ? this.runningTasks : this.queueTasks;

        const taskIndex = target.indexOf(task)
        if (taskIndex !== -1) target.splice(taskIndex, 1);
    }

    cancelTask(task: Task) {
        this.removeTask(task);
        task._callback([new Error('TIMEOUT')])
    }
}
