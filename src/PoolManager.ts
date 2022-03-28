import EventEmitter from 'events'

import { parallelPromiseLoopV0 } from './parallelPromiseLoopV0'
import { retryUponError } from './retryUponError'

export interface Pool {
    init?: () => Promise<void>;
    executeTask: (data: any) => Promise<any>,
}

export interface Task {
    attempts?: number
    options: any
    result?: [Error | unknown | null, unknown | null]
    _callback: Function;
    promise: Promise<any>
    _queueTimer?: NodeJS.Timeout
}

export type IDistributeTasks = (pools: Pool[], tasks: Task[]) => [Pool, Task | undefined][] | null | undefined;

export interface Options {
    pools: Pool[],
    poolInitQueueSize: number,
    poolInitRetryAttempts: number,
    distributeTasks?: IDistributeTasks,
    // taskAttempts?: number,
    taskQueueTimeout?: number,
}

export const defaultDistributeTasks: IDistributeTasks =
    (pools: Pool[], tasks: Task[]) => pools
        .map((pool, i) => [pool, tasks[i]])
// .filter(([pool, task]) => task)

export class PoolManager extends EventEmitter {
    queueTasks: Task[] = [];
    runningTasks: Task[] = [];
    freePools: Pool[] = [];
    runningPools: Pool[] = [];
    failedPools: [Pool, unknown][] = [];
    distributeTasks: IDistributeTasks;

    constructor(protected options: Options) {
        super();
        this.distributeTasks = this.options.distributeTasks || defaultDistributeTasks
    }

    async init() {
        await parallelPromiseLoopV0<Pool>({
            iterateArray: this.options.pools,
            statement: async (pool: Pool): Promise<void> => {
                try {
                    if (pool.init)
                        await pool.init();
                    this.addFreePool(pool);
                } catch (error) {
                    this.failedPools.push([pool, error]);
                }
            },
            maxThreads: this.options.poolInitQueueSize,
            attempts: this.options.poolInitRetryAttempts,
        })
        if (!this.freePools.length && !this.runningTasks.length)
            throw new Error('No pools are available')
        return this;
    }

    addFreePool(pool: Pool) {
        const poolIndex = this.runningPools.indexOf(pool)
        if (poolIndex !== -1) this.runningPools.splice(poolIndex, 1);

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
        if (!this.freePools.length || !this.queueTasks.length) return

        for (; ;) {
            const directions = this.distributeTasks(this.freePools, this.queueTasks);

            if (!directions || !directions.length) break

            let countEmptyTasks = 0;

            for (let [pool, task] of directions) {
                if (!task) {
                    countEmptyTasks++
                    continue
                };

                this.executeTask(pool, task)
            }

            if (countEmptyTasks === directions.length) break;
        }
    }

    proceedRawTask(rawTask: any): Task {
        let _callback;

        const promise = new Promise((resolve) => _callback = resolve)

        const task: Task = {
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
        this.runningPools.push(pool);

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
