import EventEmitter from 'events'
import { removeFromArray } from '../removeFromArray';
import { retryUponError } from "../retryUponError";
import type { PoolManager } from "./Manager";
import {
    PoolInstanceBaseState, PoolInstanceDefaultState,
    PoolInstanceOptions, PoolInstanceStatus,
    PoolTaskMini
} from "./types";

type ErrorType = Error | any;

let aiForInstanceName = 0;

export class PoolInstance<PoolInstanceState extends PoolInstanceBaseState = PoolInstanceDefaultState> extends EventEmitter {
    manager?: PoolManager;
    constructor(options: PoolInstanceOptions<PoolInstanceState> = {}) {
        super();
        this.manager = options.manager;
        if (options.userState)
            Object.assign(this.__state, options.userState)
        this.manager?.poolList.push(this);
    }

    /** @internal */
    __state: PoolInstanceState = {
        instanceName: `PoolInstance-${aiForInstanceName++}`,
        status: PoolInstanceStatus.initStarting,
    } as PoolInstanceState;
    getState(): Promise<PoolInstanceState>;
    getState(options: { sync: true }): PoolInstanceState;
    getState(options: { sync?: boolean } = {}): PoolInstanceState | Promise<PoolInstanceState> {
        if (options.sync)
            return this.__state;
        return Promise.resolve(this.__state)
    }
    getStateSync() {
        return this.getState({ sync: true })
    }
    async setState<T extends keyof PoolInstanceState>(key: T, value: PoolInstanceState[T]): Promise<void>
    async setState<T extends keyof PoolInstanceBaseState>(key: T, value: PoolInstanceBaseState[T]): Promise<void>
    async setState<T extends keyof PoolInstanceBaseState>(key: T, value: PoolInstanceBaseState[T]): Promise<void> {
        if ('error' === key) {
            this.__state.error = value
            await this.setState('status', (await this.getState()).status.includes('init') ?
                PoolInstanceStatus.initFailed :
                PoolInstanceStatus.failed)
        } else if ('status' === key) {
            const oldStatus = this.__state.status;
            this.__state.status = value
            this._onChangeStateStatus(oldStatus, value)
        } else {
            this.__state[key] = value
        }
    }
    private _onChangeStateStatus(oldStatus: PoolInstanceStatus, status: PoolInstanceStatus) {
        if (oldStatus === status) return;
        this.emit('status', status)

        if (this.__state.error && ![PoolInstanceStatus.failed, PoolInstanceStatus.initFailed].includes(status)) {
            this.__state.error = undefined
        }

        // do not proceed if we haven't manager, so no need to manage
        if (!this.manager) return;

        if (status === PoolInstanceStatus.killed) {
            removeFromArray(this.manager.poolList, this)
            removeFromArray(this.manager.freePools, this)
            return;
        }

        // remove pool from old the manager' state array
        if (oldStatus === PoolInstanceStatus.free) {
            removeFromArray(this.manager.freePools, this)
        }

        // handle free pool
        if (status === PoolInstanceStatus.free) {
            this.manager.freePools.push(this);
            this.manager.distributeQueuedTasks();

            if (this.__state.status === PoolInstanceStatus.free) {
                this.emit('free')
                this.manager.emit('freePool', this)
            }
        }
    }

    get isAlive() {
        return [PoolInstanceStatus.free, PoolInstanceStatus.running].includes(this.__state.status)
    }
    get isFree() {
        return [PoolInstanceStatus.free].includes(this.__state.status)
    }
    get isKilled() {
        return [PoolInstanceStatus.killed].includes(this.__state.status)
    }

    async start(): Promise<void> { }
    /**
     * 
     * @internal
     */
    async _start() {
        try {
            await this.setState('status', PoolInstanceStatus.initStarting);
            await retryUponError({
                func: () => this.start(),
                attempts: this.manager?.options.poolInitAttempts,
            });
            await this.setState('status', PoolInstanceStatus.free);
        } catch (error) {
            await this.setState('error', error);
            this.manager?.options.poolInitOnError(error, this)
        }
    }

    async restart() {
        throw new Error('Please set restart by yourself')
    }
    async kill() {
        await this.setState('status', PoolInstanceStatus.killed);
    }

    /**
     * Decide whats do next with current pool after task were done(even with error)
     * 
     * Should set next state of the pool
     * 
     * @param task was passed to `executeTask`
     * @param result by `executeTask`
     */
    async executeTaskOnResult(task: PoolTaskMini, result: { error: ErrorType } | { response: any }) {
        await this.setState('status', PoolInstanceStatus.free);
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
            await this.setState('status', PoolInstanceStatus.running);

            const response = await this.executeTask(task)

            this.executeTaskOnResult(task, { response });

            return response;
        } catch (error) {
            this.executeTaskOnResult(task, { error })
            throw error;
        }
    }
}
