import { ChildProcess, fork } from 'node:child_process'
import { PoolInstance, PoolTaskMini } from "../Pool";
import { RpcManager } from '../RpcManager';
import { ProcessPoolInstanceOptions, ProcessPoolRpcId } from './types';
import treeKill from 'tree-kill'

export class ProcessPoolInstance extends PoolInstance {
    childProcess?: ChildProcess;
    rpcManager?: RpcManager;
    options: ProcessPoolInstanceOptions;
    constructor(options: ProcessPoolInstanceOptions) {
        super(options);
        this.options = options;
    }

    async start() {
        await this.close();

        const childProcess = this.childProcess =
            fork(this.options.forkModulePath, this.options.forkArgs, this.options.forkOptions);

        this.rpcManager = new RpcManager({
            destination: childProcess,
            rpcId: ProcessPoolRpcId,
            handler(message) {
                return;
            }
        })

        await this.rpcManager.request({
            action: 'start',
        })
    }

    async close() {
        const childProcess = this.childProcess;
        if (!childProcess) return;
        this.childProcess = undefined;
        this.rpcManager = undefined;

        if (childProcess.pid)
            treeKill(childProcess.pid, 'SIGKILL', () => 1);
    }

    async executeTask({ taskContent }: PoolTaskMini): Promise<any> {
        if (!this.rpcManager) throw new Error('no this.rpcManager');
        return this.rpcManager.request({ action: 'executeTask', taskContent });
    }
}
