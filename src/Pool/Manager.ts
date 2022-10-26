import EventEmitter from 'events'

import { parallelPromiseArrayLoop } from '../parallelPromiseArrayLoop'
import { PoolManagerOptions, DefaultPoolManagerOptions, PoolTaskOptions, PoolInstance_InitOptions } from './types';
import { PoolTask } from './Task';
import { PoolInstance } from './Instance'

export class PoolManager<PoolInstanceGeneric extends PoolInstance = PoolInstance> extends EventEmitter {
    options: PoolManagerOptions;
    queueTasks: PoolTask[] = [];
    runningTasks: PoolTask[] = [];
    poolList: PoolInstanceGeneric[] = [];
    freePools: PoolInstanceGeneric[] = [];

    constructor(options: Partial<PoolManagerOptions> = {}) {
        super();
        this.options = Object.assign({}, DefaultPoolManagerOptions, options)
    }

    async startPools(options: { pools: PoolInstanceGeneric[] } & PoolInstance_InitOptions) {
        options.attempts ??= this.options.poolInitAttempts;

        await parallelPromiseArrayLoop<PoolInstanceGeneric>({
            iterateArray: options.pools,
            statement: async (pool: PoolInstanceGeneric): Promise<void> => {
                await pool._start(options);
            },
            maxThreads: this.options.poolInitQueueSize,
        })

        if (!this.freePools.length && !this.runningTasks.length)
            throw new Error('No pools are available')
        return this;
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
        options.taskQueueTimeout ??= this.options.taskQueueTimeout

        const task = new PoolTask<Result>(this, taskContent, options);

        return task
    }

}
