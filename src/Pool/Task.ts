import { retryUponError } from '../retryUponError';
import type { PoolManager } from './Manager';
import { PoolTaskResult, PoolTaskOptions, PoolTaskState } from './types';
import type { PoolInstance } from './Instance'

export class PoolTask<Result = any> {
    pool?: PoolInstance;
    generalAttempts?: number;
    poolAttempts?: number;
    result?: PoolTaskResult<Result>;
    _resolve: Function;
    promise: Promise<PoolTaskResult<Result>>;
    _queueTimer?: NodeJS.Timeout;

    constructor(public manager: PoolManager, public taskContent: any, options: PoolTaskOptions = {}) {
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
        let pushTarget: PoolTask[] | undefined;
        if (state === PoolTaskState.queue) {
            pushTarget = this.manager.queueTasks;
        } else if (state === PoolTaskState.running) {
            pushTarget = this.manager.runningTasks;
        }
        if (pushTarget) {
            pushTarget.push(this);
        }
    }

    cancel(reason: string = 'TASK_CANCEL') {
        this.state = PoolTaskState.canceled;
        this._resolve([new Error(reason)])
    }

    /**
     * 
     * @internal
     */
    resolve(pool: PoolInstance, result: PoolTaskResult): void {
        this.state = PoolTaskState.finished;
        this.result = result;
        this._resolve(result);
    }


    /**
     * 
     * @internal
     */
    execute(pool: PoolInstance): void {
        const poolIndex = this.manager.freePools.indexOf(pool)
        if (poolIndex !== -1) this.manager.freePools.splice(poolIndex, 1);

        if (this._queueTimer) {
            clearTimeout(this._queueTimer)
            this._queueTimer = undefined;
        }

        this.state = PoolTaskState.running

        this.manager.emit('startedTask', this, pool);

        retryUponError({
            func: () => pool._executeTask(this),
            attempts: this.poolAttempts,
        })
            .then((response): PoolTaskResult => [null, response, pool, this])
            .catch((err): PoolTaskResult => [err, null, pool, this])
            .then(result => this.resolve(pool, result))
    }
}
