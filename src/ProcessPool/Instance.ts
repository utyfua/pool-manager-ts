import { ChildProcess, fork } from 'node:child_process'
import { PoolInstance, PoolTaskMini } from "../Pool";
import { RpcManager, RpcMessage } from '../RpcManager';
import { ProcessPoolInstanceOptions, ProcessPoolRpcId } from './types';
import treeKill from 'tree-kill'

export class ProcessPoolInstance extends PoolInstance {
    childProcess?: ChildProcess;
    rpcManager?: RpcManager;
    options: ProcessPoolInstanceOptions;
    constructor(options: Partial<ProcessPoolInstanceOptions> & Pick<ProcessPoolInstanceOptions, 'forkModulePath'>) {
        super(options);
        this.options = Object.assign({
            killMode: 'kill',
            killCallback: (error: Error) => error && console.error(error),
        }, options);
    }

    async start() {
        await this.close();

        const childProcess = this.childProcess =
            fork(this.options.forkModulePath, this.options.forkArgs, this.options.forkOptions);

        this.rpcManager = new RpcManager({
            destination: childProcess,
            rpcId: ProcessPoolRpcId,
            handler: (message) => {
                return this.userRpcMessageHandler(message)
            },
        })

        await this.rpcManager.waitSpawn();
        await this.rpcManager.request(
            { action: 'start' },
            { timeout: this.options.startTimeout }
        )
    }

    async close() {
        const { childProcess, rpcManager } = this;
        if (!childProcess || !rpcManager) return;
        this.childProcess = undefined;
        this.rpcManager = undefined;

        await this.killProcess(childProcess, rpcManager);
    }

    async killProcess(childProcess: ChildProcess, rpcManager: RpcManager) {
        const pid = childProcess.pid
        if (!pid) return;
        const { killMode, killSignal, killCallback } = this.options;
        let error: Error | undefined;
        if (killMode === 'kill') {
            childProcess.kill(killSignal);
            error = await rpcManager.waitForEvent('close')
                .then(_ => undefined).catch(error => error)
        } else if (killMode === 'treeKill') {
            error = await new Promise(callback => treeKill(pid, killSignal, callback))
        } else {
            error = new Error(`Unknown kill mode: ${killMode}`);
        }
        killCallback(error);
    }

    async executeTask({ taskContent }: PoolTaskMini): Promise<any> {
        if (!this.rpcManager) throw new Error('no this.rpcManager');
        return this.rpcManager.request(
            { action: 'executeTask', taskContent },
            { timeout: this.options.executeTaskTimeout }
        );
    }

    userRpcMessageHandler(message: RpcMessage) {
        return
    }
}
