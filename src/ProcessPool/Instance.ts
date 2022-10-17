import { ChildProcess, fork } from 'node:child_process'
import { PoolInstance, PoolTaskMini } from "../Pool";
import { RpcManager, RpcMessage } from '../RpcManager';
import { ProcessPoolInstanceOptions, ProcessPoolRpcId } from './types';

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

    /**
     * Kill process using `childProcess.kill`
     * @returns Error if happened
     * @internal
     */
    async killProcessByKill(
        childProcess: ChildProcess,
        rpcManager: RpcManager,
        killSignal?: NodeJS.Signals | number
    ): Promise<Error | undefined> {
        try {
            childProcess.kill(killSignal);

            // for some reason we can kill instantly, so here will be no event after
            if (!childProcess.killed)
                await rpcManager.waitForEvent('close');
        } catch (error) {
            return error as Error;
        }
    }

    /**
     * Kill process using `tree-kill`
     * @returns Error if happened
     * @internal
     */
    async killProcessByTreeKill(
        childProcess: ChildProcess,
        rpcManager: RpcManager,
        pid: number,
        killSignal?: NodeJS.Signals | number,
    ): Promise<Error | undefined> {
        const { default: treeKill } = await import('tree-kill');
        let error = await new Promise<Error | undefined>(callback => treeKill(pid, killSignal, callback))

        // for some reason root process will stay alive without any error so lets kill by default method
        if (!error && childProcess.exitCode === null) {
            error = await this.killProcessByKill(childProcess, rpcManager, killSignal)
        }

        return error;
    }

    async killProcess(childProcess: ChildProcess, rpcManager: RpcManager) {
        const pid = childProcess.pid
        if (!pid) return;

        const { killMode, killSignal, killCallback } = this.options;
        let error: Error | undefined;

        if (killMode === 'kill') {
            error = await this.killProcessByKill(childProcess, rpcManager, killSignal)
        } else if (killMode === 'treeKill') {
            error = await this.killProcessByTreeKill(childProcess, rpcManager, pid, killSignal)
        } else {
            error = new Error(`Unknown kill mode: ${killMode}`);
        }

        // in case if process still alive for some reason
        if (!error && !this.options.skipKilledCheck &&
            childProcess.signalCode === null && 
            childProcess.exitCode === null && 
            !childProcess.killed
        ) {
            error = new Error(`Process with pid ${pid} still alive but should be killed by now using "${killMode}" mode`)
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
