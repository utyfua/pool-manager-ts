import { retryUponError, retryUponErrorOptions } from './retryUponError'

export type parallelPromiseLoopOptions<State> = {
    /** The maximum number of threads to use. Defaults to 1. */
    maxThreads?: number,
    /** A function that is called to initialize the loop state. */
    initialization: () => State,
    /**
     * A function that is called to check if the loop should continue.
     * If this function returns a promise, the loop will wait for the promise to resolve before continuing.
     * @param state The current state of the loop.
     * @returns `true` if the loop should continue, `false` otherwise.
     */
    condition: (state: State) => boolean | Promise<boolean>,
    /**
     * A function that is called to update the loop state after each iteration.
     * @param state The current state of the loop.
     * @returns The updated state of the loop.
     */
    finalExpression?: (state: State) => State,
    /**
     * A function that is called to perform the main task of each iteration.
     * This function should return a promise.
     * @param tickState The current state of the loop.
     * @returns A promise that resolves when the task for the current iteration is complete.
     */
    statement: (tickState: State) => Promise<unknown | void> | unknown | void,
} & Pick<retryUponErrorOptions, 'attempts' | 'onerror' | 'retryStrategy'>

/**
 * A function that runs a loop in parallel, using multiple threads.
 * @template State The type of the loop state.
 * @param options An object with options for the loop.
 * @returns A promise that resolves when the loop is complete.
 */
export function parallelPromiseLoop<State>({
    maxThreads = 1, initialization, condition, finalExpression, statement,
    attempts = 1, onerror, retryStrategy
}: parallelPromiseLoopOptions<State>): Promise<void> {
    let curThreads = 0;
    let loopState = initialization();
    let nextThreadCallback: (() => void) | null = null;
    let allInit: boolean = false;

    return new Promise(async (resolve, reject) => {
        const manageNextThreadCallback = async () => {
            if (curThreads > maxThreads) {
                await new Promise<void>((res) => nextThreadCallback = res);
                nextThreadCallback = null; // Reset the callback to avoid memory leak
            }
        };

        const processThread = async () => {
            try {
                await retryUponError({
                    func: () => statement(loopState),
                    attempts, onerror, retryStrategy,
                });
                curThreads--;
                nextThreadCallback?.();
                if (allInit && curThreads === 0) resolve();
            } catch (err) {
                reject(err);
            }
        };

        while (await condition(loopState)) {
            curThreads++;
            await manageNextThreadCallback();
            processThread();

            if (finalExpression) loopState = finalExpression(loopState);
        }

        allInit = true;
        if (curThreads === 0) resolve();
    });
}
