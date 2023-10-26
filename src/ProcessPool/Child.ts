import { wrapInputAsResultOrError, ProcessIpcBus, Message } from "ipc-bus-promise";
import { PoolInstance, PoolInstanceBaseState, PoolInstanceDefaultState, PoolTaskMini } from "../Pool";

let secondCallDetector = false;

export class ProcessPoolChildInstance<PoolInstanceState extends PoolInstanceBaseState = PoolInstanceDefaultState> extends PoolInstance<PoolInstanceState> {
    ipcBus: ProcessIpcBus

    private _latestError: any;
    getState(): Promise<PoolInstanceState>;
    getState(options: { sync: true }): PoolInstanceState;
    getState(options: { sync?: boolean } = {}): PoolInstanceState | Promise<PoolInstanceState> {
        if (options.sync) throw new Error('sync is not supported here')
        return this.ipcBus.request({ action: 'getState' }).then(state => {
            if (state.error) state.error = this._latestError;
            return state;
        })
    }
    async setState<T extends keyof PoolInstanceState>(key: T, value: PoolInstanceState[T]) {
        if (key === 'error') {
            this._latestError = value;
            value = wrapInputAsResultOrError({ error: value }) as any;
        }
        await this.ipcBus.request({ action: 'setState', key, value })
    }

    constructor({ executeTask }: { executeTask?: (task: PoolTaskMini) => any } = {}) {
        super();
        if (executeTask)
            this.executeTask = executeTask;

        if (secondCallDetector)
            throw new Error('class ProcessPoolChild should be uniq per process');
        secondCallDetector = true;

        this.ipcBus = new ProcessIpcBus({
            process,
            handler: async (message) => {
                if (message.action === 'start') {
                    await this.start()
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

    userRpcMessageHandler(message: Message) {
        return
    }
}
