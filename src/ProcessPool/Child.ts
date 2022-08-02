import { PoolInstance, PoolInstanceState, PoolTaskMini } from "../Pool";
import { RpcManager, RpcManagerDestination } from "../RpcManager";
import { ProcessPoolRpcId } from "./types";

let secondCallDetector = false;

export class ProcessPoolChildInstance extends PoolInstance {
    rpcManager: RpcManager
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

                    if (this.state === PoolInstanceState.free)
                        return { success: true };

                    if (this.stateError) throw this.stateError;
                    throw new Error('Unknown state');
                }

                if (message.action === 'executeTask') {
                    return await this.executeTask({
                        taskContent: message.taskContent,
                    });
                }
            }
        })
    }
}
