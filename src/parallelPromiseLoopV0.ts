// todo: rework, do 2 separate function

import { retryUponError } from './retryUponError'

export interface parallelPromiseLoopV0Options<Element, State> {
    maxThreads: number,
    initialization?: () => State,
    condition?: (state: State) => boolean,
    finalExpression?: (state: State) => State,
    iterateArray?: Element[],
    statement: (element: any, index?: number) => Promise<void>,
    attempts: number
}

export async function parallelPromiseLoopV0<Element>({
    maxThreads = 1, initialization, condition, finalExpression, iterateArray, statement, attempts
}: parallelPromiseLoopV0Options<Element, number>) {
    if (iterateArray) {
        if (!initialization) initialization = () => 0;
        if (!condition) condition = i => i < iterateArray.length;
        if (!finalExpression) finalExpression = i => i + 1;
    };
    if (!attempts) attempts = 1;

    let curThreads = 0;
    // @ts-ignore
    let loopState = initialization();
    let nextThreadCallback: Function = () => 1;
    let allInit: boolean = false;
    return new Promise(async function (resolve, reject) {
        for (; ;) {
            // @ts-ignore
            if (!await condition(loopState)) break;
            curThreads++;
            if (curThreads > maxThreads) {
                await new Promise(function (resolve) { nextThreadCallback = resolve });
            }
            retryUponError({
                func: iterateArray ?
                    () => statement(iterateArray[loopState], loopState) :
                    () => statement(loopState),
                attempts
            })
                .then(() => {
                    curThreads--;
                    nextThreadCallback();
                    allInit && !curThreads && resolve(null);
                })
                .catch(err => reject(err));
            // @ts-ignore
            loopState = finalExpression(loopState)
        };
        !curThreads && resolve(null);
        allInit = true;
    });
}
