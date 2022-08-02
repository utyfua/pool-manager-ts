
import { ForkOptions } from 'node:child_process';
import { PoolInstanceOptions } from "../Pool";

export const ProcessPoolRpcId = 'ProcessPoolMessagingId';

export interface ProcessPoolInstanceOptions extends PoolInstanceOptions {
    forkModulePath: string;
    forkArgs?: readonly string[] | undefined;
    forkOptions?: ForkOptions | undefined;
}
