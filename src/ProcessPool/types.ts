
import type { ForkOptions } from 'node:child_process';
import type { TimeoutType } from 'ipc-bus-promise';
import type { PoolInstanceOptions } from "../Pool";

export interface ProcessPoolInstanceOptions<PoolInstanceState> extends PoolInstanceOptions<PoolInstanceState> {
    forkModulePath: string;
    forkArgs?: readonly string[] | undefined;
    forkOptions?: ForkOptions | undefined;
    startTimeout?: TimeoutType;
    executeTaskTimeout?: TimeoutType;

    killMode: 'kill' | 'treeKill';
    killSignal?: NodeJS.Signals | number;
    killCallback: (error?: Error | undefined) => void;
    skipKilledCheck?: boolean,
}
