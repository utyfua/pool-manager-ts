import { PoolInstance, PoolInstanceBaseState, PoolInstanceDefaultState, PoolInstanceStatus, PoolTaskMini } from "../Pool";
import { possiblyErrorObjectify } from "../possiblyErrorPlainObjectify";
import { RpcManager, RpcManagerDestination, RpcMessage } from "../RpcManager";
import { ProcessPoolRpcId } from "./types";

let secondCallDetector = false;

export class ProcessPoolChildInstance<PoolInstanceState extends PoolInstanceBaseState = PoolInstanceDefaultState> extends PoolInstance<PoolInstanceState> {
    rpcManager: RpcManager

    private _latestError: any;
    getState(): Promise<PoolInstanceState>;
    getState(options: { sync: true }): PoolInstanceState;
    getState(options: { sync?: boolean } = {}): PoolInstanceState | Promise<PoolInstanceState> {
        if (options.sync) throw new Error('sync is not supported here')
        return this.rpcManager.request({ action: 'getState' }).then(state => {
            if (state.error) state.error = this._latestError;
            return state;
        })
    }
    async setState<T extends keyof PoolInstanceState>(key: T, value: PoolInstanceState[T]) {
        if (key === 'error') {
            this._latestError = value;
            value = possiblyErrorObjectify({ error: value }) as any;
        }
        await this.rpcManager.request({ action: 'setState', key, value })
    }

    constructor({ executeTask }: { executeTask?: (task: PoolTaskMini) => any } = {}) {
        super();
        if (executeTask)
            this.executeTask = executeTask;

        if (secondCallDetector)
            throw new Error('class ProcessPoolChild should be uniq per process');
        secondCallDetector = true;

        this.rpcManager = new RpcManager({
            destination: process as RpcManagerDestination,
            rpcId: ProcessPoolRpcId,
            handler: async (message) => {
                if (message.action === 'start') {
                    await this._start({
                        attempts: message.attempts,
                    })

                    const state = await this.getState()
                    if (state.status === PoolInstanceStatus.free)
                        return { success: true };

                    if (state.error) throw state.error;
                    throw new Error('Unknown state');
                }

                if (message.action === 'executeTask') {
                    return await this.executeTask({
                        taskContent: message.taskContent,
                    });
                }

                return this.userRpcMessageHandler(message)
            }
        })
    }

    userRpcMessageHandler(message: RpcMessage) {
        return
    }
}
