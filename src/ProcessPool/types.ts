
import { ForkOptions } from 'node:child_process';
import { PoolInstanceOptions } from "../Pool";
import { TimeoutValue } from '../utils';

export const ProcessPoolRpcId = 'ProcessPoolMessagingId';

export interface ProcessPoolInstanceOptions<PoolInstanceState> extends PoolInstanceOptions<PoolInstanceState> {
    forkModulePath: string;
    forkArgs?: readonly string[] | undefined;
    forkOptions?: ForkOptions | undefined;
    startTimeout?: TimeoutValue;
    executeTaskTimeout?: TimeoutValue;

    killMode: 'kill' | 'treeKill';
    killSignal?: NodeJS.Signals | number;
    killCallback: (error?: Error | undefined) => void;
    skipKilledCheck?: boolean,
}
