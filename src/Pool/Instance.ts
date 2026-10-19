import EventEmitter from 'events'
import { removeFromArray } from '../removeFromArray';
import { retryUponError } from "../retryUponError";
import type { PoolManager } from "./Manager";
import {
    PoolInstanceBaseState, PoolInstanceDefaultState,
    PoolInstanceEventMap,
    PoolInstanceOptions, PoolInstanceStatus,
    PoolTaskMini
} from "./types";

type ErrorType = Error | any;

let aiForInstanceName = 0;

export class PoolInstance<State extends PoolInstanceBaseState = PoolInstanceDefaultState> extends EventEmitter<PoolInstanceEventMap> {
    manager?: PoolManager;
    constructor(options: PoolInstanceOptions<State> = {}) {
        super();
        this.manager = options.manager;
        if (options.userState)
            Object.assign(this.__state, options.userState)
        this.manager?.poolList.push(this);
    }

    /** @internal */
    __state: State = {
        instanceName: `PoolInstance-${aiForInstanceName++}`,
        status: PoolInstanceStatus.initStarting,
    } as State;
    getState(): Promise<State>;
    getState(options: { sync: true }): State;
    getState(options: { sync?: boolean } = {}): State | Promise<State> {
        if (options.sync)
            return this.__state;
        return Promise.resolve(this.__state)
    }
    getStateSync() {
        return this.getState({ sync: true })
    }
    async setState<T extends keyof State>(key: T, value: State[T]): Promise<void>;
    async setState(state: Partial<State>): Promise<void>;
    async setState<T extends keyof State>(keyOrState: T | Partial<State>, value?: State[T]): Promise<void> {
        const state: Partial<State> = (typeof keyOrState === 'object' && keyOrState !== null) ?
            keyOrState :
            { [keyOrState]: value } as Partial<State>;

        for (const key of Object.keys(state) as T[]) {
            const value = state[key] as State[T];
            if ('error' === key) {
                this.__state.error = value
                await this.setState('status', this.__state.status.includes('init') ?
                    PoolInstanceStatus.initFailed :
                    PoolInstanceStatus.failed)
            } else if ('status' === key) {
                const oldStatus = this.__state.status;
                if (oldStatus === PoolInstanceStatus.killed) return;
                this.__state.status = value as PoolInstanceStatus
                this._onChangeStateStatus(oldStatus, value as PoolInstanceStatus)
            } else {
                this.__state[key] = value as State[T]
            }
        }
    }
    private _onChangeStateStatus(oldStatus: PoolInstanceStatus, status: PoolInstanceStatus) {
        if (oldStatus === status) return;
        this.emit('status', status)
        this.manager?.emit('poolStatusChange', this, status)

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

        if (status === PoolInstanceStatus.closed) {
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
    async _waitInitStartingQueue() {
        const manager = this.manager;
        if (!manager) throw new Error('Manager is not available');
        if (manager.inInitStarting < manager.options.maxPoolInitSize) return;
        await this.setState('status', PoolInstanceStatus.initQueue);
        await new Promise<void>((resolve, reject) => {
            const listener = (pool: PoolInstance, status: PoolInstanceStatus) => {
                if (manager.inInitStarting < manager.options.maxPoolInitSize) {
                    manager.off('poolStatusChange', listener);
                    resolve();
                }
            };
            manager.on('poolStatusChange', listener);
        })
    }
    /**
     * 
     * @internal
     */
    async _start() {
        if (this.isKilled) return;
        try {
            await this._waitInitStartingQueue();

            await this.setState('status', PoolInstanceStatus.initStarting);
            const attempts = this.manager?.options.poolInitAttempts ?? 3;
            await retryUponError({
                func: () => this.start(),
                retryStrategy: (attempt) => !this.isKilled && attempt < attempts,
            });
            if (this.isKilled) {
                // kill() arrived while start() was in progress, release what start() acquired
                await this.kill();
                return;
            }
            await this.setState('status', PoolInstanceStatus.free);
        } catch (error) {
            if (this.isKilled) return;
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
