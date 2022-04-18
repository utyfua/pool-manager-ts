// todo: rework, do 2 separate function

import { retryUponError } from './retryUponError'

export interface parallelPromiseLoopOptions<State> {
    maxThreads?: number,
    initialization: () => State,
    condition: (state: State) => boolean,
    finalExpression: (state: State) => State,
    statement: (tickState: State) => Promise<void>,
    attempts?: number
}

export function parallelPromiseLoop<State>({
    maxThreads = 1, initialization, condition, finalExpression, statement, attempts = 1
}: parallelPromiseLoopOptions<State>) {
    let curThreads = 0;
    let loopState = initialization();
    let nextThreadCallback: Function = () => 1;
    let allInit: boolean = false;
    return new Promise(async function (resolve, reject) {
        for (; ;) {
            if (!await condition(loopState)) break;
            curThreads++;
            if (curThreads > maxThreads) {
                await new Promise(function (resolve) { nextThreadCallback = resolve });
            }
            retryUponError({
                func: () => statement(loopState),
                attempts
            })
                .then(() => {
                    curThreads--;
                    nextThreadCallback();
                    allInit && !curThreads && resolve(null);
                })
                .catch(err => reject(err));
            loopState = finalExpression(loopState)
        };
        !curThreads && resolve(null);
        allInit = true;
    });
}
