import EventEmitter from 'events'
import { retryUponError } from "../retryUponError";
import type { PoolManager } from "./Manager";
import { PoolInstanceOptions, PoolInstanceState, PoolInstance_InitOptions, PoolTaskMini } from "./types";

type ErrorType = Error | any;

export class PoolInstance extends EventEmitter {
    manager?: PoolManager;
    poolInstanceName: string;
    constructor(options: PoolInstanceOptions = {}) {
        super();
        this.manager = options.manager;
        this.poolInstanceName = `${options.poolInstanceName || Date.now()}`;

        this.manager?.poolList.push(this);
    }

    /**
     * 
     * @internal
     */
    _stateError?: ErrorType;
    get stateError() {
        return this._stateError;
    }
    set stateError(error) {
        this._stateError = error;
        this.state = this.state.includes('init') ?
            PoolInstanceState.initFailed :
            PoolInstanceState.failed;
    }

    /**
     * 
     * @internal
     */
    _state?: PoolInstanceState;
    get state(): PoolInstanceState {
        return this._state || PoolInstanceState.initQueue
    }
    set state(state: PoolInstanceState) {
        const oldState = this._state
        if (oldState === state) return;
        this.emit('state', state)

        if (![PoolInstanceState.failed, PoolInstanceState.initFailed].includes(state)) {
            this._stateError = undefined;
        }

        this._state = state;

        // do not proceed if we haven't manager, so no need to manage
        if (!this.manager) return;

        // remove pool from old the manager' state array
        let removeTarget: PoolInstance[] | undefined;
        if (oldState === PoolInstanceState.free) {
            removeTarget = this.manager.freePools;
        }
        if (removeTarget) {
            const taskIndex = removeTarget.indexOf(this)
            if (taskIndex !== -1) removeTarget.splice(taskIndex, 1);
        }

        // handle free pool
        if (state === PoolInstanceState.free) {
            this.manager.freePools.push(this);
            this.manager.distributeQueuedTasks();

            if (this.state === PoolInstanceState.free) {
                this.manager.emit('freePool', this)
            }
        }
    }

    /**
     * @deprecated
     */
    get poolStatus() {
        return {
            state: this.state,
            error: this.stateError,
        }
    }

    get isAlive() {
        return [PoolInstanceState.free, PoolInstanceState.running].includes(this.state)
    }
    get isFree() {
        return [PoolInstanceState.free].includes(this.state)
    }

    async start(): Promise<void> { }
    /**
     * 
     * @internal
     */
    async _start(options: PoolInstance_InitOptions) {
        try {
            this.state = PoolInstanceState.initStarting;
            await retryUponError({
                func: () => this.start(),
                attempts: options.attempts,
            });
            this.state = PoolInstanceState.free;
        } catch (error) {
            options.onerror && options.onerror(this, error)
            this.stateError = error;
        }
    }

    /**
     * Decide whats do next with current pool after task were done(even with error)
     * 
     * Should set next state of the pool
     * 
     * @param task was passed to `executeTask`
     * @param result by `executeTask`
     */
    executeTaskOnResult(task: PoolTaskMini, result: { error: ErrorType } | { response: any }) {
        this.state = PoolInstanceState.free;
    }

    /**
     * User defined function
     * 
     * @param task
     */
    async executeTask(task: PoolTaskMini): Promise<any> {
        throw new Error('You should provide PoolInstance.executeTask')
    }

    /**
     * 
     * @internal
     */
    async _executeTask(task: PoolTaskMini): Promise<any> {
        try {
            this.state = PoolInstanceState.running;

            const response = await this.executeTask(task)

            this.executeTaskOnResult(task, { response });

            return response;
        } catch (error) {
            this.executeTaskOnResult(task, { error })
            throw error;
        }
    }
}
