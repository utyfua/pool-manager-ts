import EventEmitter from 'events'

import { parallelPromiseArrayLoop } from '../parallelPromiseArrayLoop'
import { retryUponError } from '../retryUponError'
import { PoolManagerOptions, PoolInstance, DefaultPoolManagerOptions, PoolInstanceState, PoolStatus, PoolTaskOptions } from './types';
import { PoolTask } from './Task';

export class PoolManager extends EventEmitter {
    options: PoolManagerOptions;
    queueTasks: PoolTask[] = [];
    runningTasks: PoolTask[] = [];
    poolList: PoolInstance[] = [];
    freePools: PoolInstance[] = [];

    constructor({ pools, ...options }: Partial<PoolManagerOptions> & { pools?: PoolInstance[] } = {}) {
        super();
        this.options = Object.assign({}, DefaultPoolManagerOptions, options)

        if (pools) {
            this.addPools(pools)
        }
    }

    async init({ pools, attempts, onerror }: { pools: PoolInstance[], attempts: number | undefined, onerror?: (pool: PoolInstance, error: Error | any) => void }) {
        this.addPools(pools, {
            state: PoolInstanceState.initQueue,
        });

        await parallelPromiseArrayLoop<PoolInstance>({
            iterateArray: pools,
            statement: async (pool: PoolInstance): Promise<void> => {
                try {
                    if (pool.init) {
                        pool.poolStatus = {
                            state: PoolInstanceState.initStarting
                        };
                        await retryUponError({
                            func: () => pool.init && pool.init(),
                            attempts: attempts || this.options.poolInitAttempts,
                        });
                    }
                    if (pool.poolStatus.state === PoolInstanceState.initQueue)
                        this.addFreePool(pool);
                } catch (error) {
                    onerror && onerror(pool, error)
                    pool.poolStatus = {
                        state: PoolInstanceState.initFailed,
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

    addPools(pools: PoolInstance[], status?: PoolStatus): void {
        pools.forEach(pool => this.addPool(pool, status));
    }

    addPool(pool: PoolInstance, status: PoolStatus = { state: PoolInstanceState.free }): void {
        pool.poolStatus = status;

        if (!this.poolList.includes(pool))
            this.poolList.push(pool);

        if (status.state === PoolInstanceState.free)
            this.addFreePool(pool);
    }

    addFreePool(pool: PoolInstance): void {
        pool.poolStatus = {
            state: PoolInstanceState.free
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
    distributeQueuedTasks(): void {
        for (; ;) {
            if (!this.freePools.length || !this.queueTasks.length) break;

            const directions = this.options.distributeTasks(this.freePools, this.queueTasks);

            if (!directions?.length) break

            let countEmptyTasks = 0;

            for (let [pool, task] of directions) {
                if (!pool || !task) {
                    countEmptyTasks++
                    continue
                };

                task.execute(pool)
            }

            if (countEmptyTasks === directions.length) break;
        }
    }

    proceedRawTask<Result = any>(taskContent: any, options: PoolTaskOptions = {}): PoolTask<Result> {
        // setup options
        options.generalAttempts ??= this.options.taskGeneralExecuteAttempts
        options.poolAttempts ??= this.options.taskPoolExecuteAttempts

        const task = new PoolTask<Result>(this, taskContent, options);

        this.distributeQueuedTasks()

        return task
    }

}
