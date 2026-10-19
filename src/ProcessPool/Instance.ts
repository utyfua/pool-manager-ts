import { unwrapResultOrError, ProcessIpcBus, Message } from 'ipc-bus-promise'
import { ChildProcess, fork } from 'node:child_process'
import { PoolInstance, PoolInstanceBaseState, PoolInstanceDefaultState, PoolInstanceStatus, PoolTaskMini } from "../Pool";
import { ProcessPoolInstanceOptions } from './types';

export class ProcessPoolInstance<State extends PoolInstanceBaseState = PoolInstanceDefaultState> extends PoolInstance {
    childProcess?: ChildProcess;
    ipcBus?: ProcessIpcBus;
    options: ProcessPoolInstanceOptions<State>;
    constructor(options: Partial<ProcessPoolInstanceOptions<State>> & Pick<ProcessPoolInstanceOptions<State>, 'forkModulePath'>) {
        super(options);
        this.options = Object.assign({
            killMode: 'kill',
            killCallback: (error: Error) => error && console.error(error),
        }, options);
    }

    async start() {
        await this.close();
        if (this.isKilled) throw new Error('Pool instance was killed');

        const childProcess = this.childProcess =
            fork(this.options.forkModulePath, this.options.forkArgs, this.options.forkOptions);

        this.ipcBus = new ProcessIpcBus({
            process: childProcess,
            handler: (message) => {
                if (message.action === 'getState') {
                    return this.getState()
                }
                if (message.action === 'setState') {
                    if (message.state && 'error' in message.state) {
                        message.state.error = unwrapResultOrError(message.state.error, { doNotThrow: true })
                    }
                    return this.setState(message.state)
                }
                return this.userRpcMessageHandler(message)
            },
        })

        await this.ipcBus.waitSpawn();
        await this.ipcBus.request(
            { action: 'start' },
            { timeout: this.options.startTimeout }
        )
    }

    private async _close(kill?: boolean) {
        const { childProcess, ipcBus } = this;
        if (!childProcess || !ipcBus) {
            // no process yet (queued start or mid-restart), kill() still has to take effect
            if (kill) await this.setState('status', PoolInstanceStatus.killed);
            return;
        }
        await this.setState('status',
            kill ?
                PoolInstanceStatus.killed :
                PoolInstanceStatus.closed);
        this.childProcess = undefined;
        this.ipcBus = undefined;

        ipcBus.close()
        await this._killProcess(childProcess, ipcBus);
    }

    async close() {
        return this._close(false);
    }

    async restart() {
        await this._start();
    }

    async kill() {
        return this._close(true);
    }

    /**
     * Kill process using `childProcess.kill`
     * @returns Error if happened
     * @internal
     */
    private async _killProcessByKill(
        childProcess: ChildProcess,
        ipcBus: ProcessIpcBus,
        killSignal?: NodeJS.Signals | number
    ): Promise<Error | undefined> {
        try {
            childProcess.kill(killSignal);

            // for some reason we can kill instantly, so here will be no event after
            if (!childProcess.killed)
                await ipcBus.waitForEvent('close');
        } catch (error) {
            return error as Error;
        }
    }

    /**
     * Kill process using `tree-kill`
     * @returns Error if happened
     * @internal
     */
    private async _killProcessByTreeKill(
        childProcess: ChildProcess,
        ipcBus: ProcessIpcBus,
        pid: number,
        killSignal?: NodeJS.Signals | number,
    ): Promise<Error | undefined> {
        const { default: treeKill } = await import('tree-kill');
        let error = await new Promise<Error | undefined>(callback => treeKill(pid, killSignal, callback))

        // for some reason root process will stay alive without any error so lets kill by default method
        if (!error && childProcess.exitCode === null) {
            error = await this._killProcessByKill(childProcess, ipcBus, killSignal)
        }

        return error;
    }

    private async _killProcess(childProcess: ChildProcess, ipcBus: ProcessIpcBus) {
        const pid = childProcess.pid
        if (!pid) return;

        const { killMode, killSignal, killCallback } = this.options;
        let error: Error | undefined;

        if (killMode === 'kill') {
            error = await this._killProcessByKill(childProcess, ipcBus, killSignal)
        } else if (killMode === 'treeKill') {
            error = await this._killProcessByTreeKill(childProcess, ipcBus, pid, killSignal)
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
        if (!this.ipcBus) throw new Error('no this.rpcManager');
        return this.ipcBus.request(
            { action: 'executeTask', taskContent },
            { timeout: this.options.executeTaskTimeout }
        );
    }

    userRpcMessageHandler(message: Message) {
        return
    }
}
