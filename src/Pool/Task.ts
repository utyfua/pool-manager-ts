import EventEmitter from 'events';
import { retryUponError } from '../retryUponError';
import type { PoolManager } from './Manager';
import { PoolTaskResult, PoolTaskOptions, PoolTaskState } from './types';
import type { PoolInstance } from './Instance'

export class PoolTask<Result = any> extends EventEmitter {
    pool?: PoolInstance;
    generalAttempts?: number;
    poolAttempts?: number;
    result?: PoolTaskResult<Result>;
    _resolve: Function;
    promise: Promise<PoolTaskResult<Result>>;
    _queueTimer?: NodeJS.Timeout;

    constructor(public manager: PoolManager, public taskContent: any, options: PoolTaskOptions = {}) {
        super();

        // assign options
        Object.assign(this, options)

        // setup promises
        let _resolve;
        this.promise = new Promise((resolve) => _resolve = resolve);
        this._resolve = _resolve as unknown as Function;

        // setup timeout
        if (typeof options.taskQueueTimeout === 'number') {
            this._queueTimer = setTimeout(() => this.cancel('TIMEOUT'), options.taskQueueTimeout)
        }

        this.state = PoolTaskState.queue;

        this.manager.emit('taskInit', this);
    }

    _state?: PoolTaskState;
    get state(): PoolTaskState {
        return this._state || PoolTaskState.queue
    }
    set state(state: PoolTaskState) {
        const oldState = this._state
        if (oldState === state) return;
        this._state = state;

        // remove task from old the manager' state array
        let removeTarget: PoolTask[] | undefined;
        if (oldState === PoolTaskState.queue) {
            removeTarget = this.manager.queueTasks;
        } else if (oldState === PoolTaskState.running) {
            removeTarget = this.manager.runningTasks;
        }
        if (removeTarget) {
            const taskIndex = removeTarget.indexOf(this)
            if (taskIndex !== -1) removeTarget.splice(taskIndex, 1);
        }

        // add task to the manager' state array
        if (state === PoolTaskState.queue) {
            this.manager.queueTasks.push(this);
            this.manager.distributeQueuedTasks()
        } else if (state === PoolTaskState.running) {
            this.manager.runningTasks.push(this);
        }
    }

    cancel(reason: string = 'TASK_CANCEL') {
        const result: PoolTaskResult = [new Error(reason), null, null, this];
        this.resolve(result, PoolTaskState.canceled)
    }

    /**
     * 
     * @internal
     */
    resolve(result: PoolTaskResult, state: PoolTaskState = PoolTaskState.finished): void {
        if (this.generalAttempts !== undefined) this.generalAttempts--;
        if (state === PoolTaskState.finished && result[0] && this.generalAttempts) {
            this.state = PoolTaskState.queue;
            return;
        }
        this.state = state;
        this.result = result;
        this._resolve(result);
        this.manager.emit('taskResult', this, result);
        this.emit('result', result);
    }


    /**
     * 
     * @internal
     */
    execute(pool: PoolInstance): void {
        this.pool = pool;
        const poolIndex = this.manager.freePools.indexOf(pool)
        if (poolIndex !== -1) this.manager.freePools.splice(poolIndex, 1);

        if (this._queueTimer) {
            clearTimeout(this._queueTimer)
            this._queueTimer = undefined;
        }

        this.state = PoolTaskState.running

        this.manager.emit('taskExecute', this, pool);
        this.emit('execute', this, pool);

        retryUponError({
            func: () => pool._executeTask(this),
            attempts: this.poolAttempts,
        })
            .then((response): PoolTaskResult => [null, response, pool, this])
            .catch((err): PoolTaskResult => [err, null, pool, this])
            .then(result => this.resolve(result))
    }
}
